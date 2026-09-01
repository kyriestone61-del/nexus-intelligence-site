-- PostgreSQL requires UNION result ordering to operate on the unified result set.
CREATE OR REPLACE FUNCTION public.nexus_get_inbox(p_company_id uuid DEFAULT NULL)
RETURNS TABLE(
  item_key text,kind text,company_id uuid,company_name text,title text,message text,status text,priority text,
  due_at timestamptz,created_at timestamptz,action_url text,related_type text,related_id uuid,
  approval_chain_id uuid,approval_step_id uuid,step_order integer,step_count integer,can_approve boolean,is_unread boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_admin boolean:=public.nexus_is_platform_admin(); v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT v_admin AND p_company_id IS NULL THEN RAISE EXCEPTION 'Company is required'; END IF;
  IF NOT v_admin AND NOT public.nexus_is_company_member(p_company_id) THEN RAISE EXCEPTION 'Company membership required'; END IF;

  RETURN QUERY
  WITH visible_chains AS (
    SELECT c.* FROM public.nexus_approval_chains c
    WHERE c.status IN ('pending','changes_requested')
      AND (v_admin OR (c.visibility='company' AND c.company_id=p_company_id AND public.nexus_is_company_member(c.company_id)))
      AND (p_company_id IS NULL OR c.company_id=p_company_id OR (v_admin AND c.company_id IS NULL))
  ), pending_steps AS (
    SELECT s.*,c.company_id,c.title chain_title,c.description chain_description,c.status chain_status,c.id chainid,co.name company_name,
      (SELECT count(*)::int FROM public.nexus_approval_chain_steps x WHERE x.chain_id=c.id) step_count
    FROM visible_chains c
    JOIN public.nexus_approval_chain_steps s ON s.chain_id=c.id AND s.status='pending'
    LEFT JOIN public.nexus_companies co ON co.id=c.company_id
  ), unified AS (
    SELECT 'approval:'||ps.id::text item_key,'approval'::text kind,ps.company_id,ps.company_name,ps.chain_title title,
      coalesce(ps.chain_description,ps.instructions,'Approval is waiting for review.') message,ps.chain_status status,
      CASE WHEN ps.due_at IS NOT NULL AND ps.due_at<now() THEN 'high' ELSE 'normal' END priority,
      ps.due_at,ps.created_at,'/portal?view=inbox&approval_chain='||ps.chainid::text action_url,'approval_chain'::text related_type,ps.chainid related_id,
      ps.chainid approval_chain_id,ps.id approval_step_id,ps.step_order,ps.step_count,
      private.nexus_user_can_approve_step(ps.id,v_user) can_approve,false is_unread
    FROM pending_steps ps

    UNION ALL
    SELECT 'task:'||t.id::text,'task',t.company_id,co.name,t.title,coalesce(t.description,'Action item requires attention.'),t.status,t.priority,
      CASE WHEN t.due_date IS NULL THEN NULL ELSE t.due_date::timestamptz END,t.created_at,'/portal?view=inbox&task='||t.id::text,'task',t.id,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,
      CASE WHEN v_admin THEN t.status='ready_for_review' OR t.assignee='nexus' ELSE t.assignee='client' END,false
    FROM public.nexus_tasks t JOIN public.nexus_companies co ON co.id=t.company_id
    WHERE t.status NOT IN ('done','completed','not_applicable','draft')
      AND (p_company_id IS NULL OR t.company_id=p_company_id)
      AND (v_admin OR (t.company_id=p_company_id AND public.nexus_is_company_member(t.company_id) AND t.assignee='client'))
      AND (CASE WHEN v_admin THEN (t.status='ready_for_review' OR t.assignee='nexus') ELSE true END)

    UNION ALL
    SELECT 'document_request:'||d.id::text,'document_request',d.company_id,co.name,d.title,coalesce(d.purpose,'Nexus requested supporting evidence.'),d.status,'normal',
      CASE WHEN d.due_date IS NULL THEN NULL ELSE d.due_date::timestamptz END,d.created_at,'/portal?view=inbox&document_request='||d.id::text,'document_request',d.id,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NOT v_admin,false
    FROM public.nexus_document_requests d JOIN public.nexus_companies co ON co.id=d.company_id
    WHERE d.status='requested' AND (p_company_id IS NULL OR d.company_id=p_company_id)
      AND (v_admin OR (d.company_id=p_company_id AND public.nexus_is_company_member(d.company_id)))

    UNION ALL
    SELECT 'question:'||q.id::text,'question',q.company_id,co.name,'Diagnosis report question',q.question,q.status,'normal',NULL::timestamptz,q.created_at,
      '/portal?view=diagnosis-question&question='||q.id::text,'diagnosis_report_question',q.id,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,v_admin,false
    FROM public.nexus_diagnosis_report_questions q JOIN public.nexus_companies co ON co.id=q.company_id
    WHERE q.status='open' AND (p_company_id IS NULL OR q.company_id=p_company_id)
      AND (v_admin OR (q.company_id=p_company_id AND public.nexus_is_company_member(q.company_id) AND q.asked_by=v_user))

    UNION ALL
    SELECT 'notification:'||n.id::text,'update',n.company_id,co.name,n.title,coalesce(n.message,''),'unread','normal',NULL::timestamptz,n.created_at,
      coalesce(n.action_url,'/portal?view=inbox'),'notification',n.id,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,false,true
    FROM public.nexus_notifications n LEFT JOIN public.nexus_companies co ON co.id=n.company_id
    WHERE n.read_at IS NULL AND (n.user_id IS NULL OR n.user_id=v_user)
      AND (p_company_id IS NULL OR n.company_id=p_company_id)
      AND (v_admin OR (n.company_id=p_company_id AND public.nexus_is_company_member(n.company_id)))

    UNION ALL
    SELECT 'founder:'||f.id::text,'founder_decision',NULL::uuid,NULL::text,f.title,coalesce(f.context,f.recommended_action,''),f.status,f.priority,f.due_at,f.created_at,
      '/portal?view=revenue-engine&decision='||f.id::text,'founder_decision',f.id,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,v_admin,false
    FROM public.nexus_founder_decision_queue f
    WHERE v_admin AND p_company_id IS NULL AND f.status='open'
  )
  SELECT u.item_key,u.kind,u.company_id,u.company_name,u.title,u.message,u.status,u.priority,u.due_at,u.created_at,u.action_url,u.related_type,u.related_id,
    u.approval_chain_id,u.approval_step_id,u.step_order,u.step_count,u.can_approve,u.is_unread
  FROM unified u
  ORDER BY CASE u.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
    u.due_at ASC NULLS LAST,u.created_at DESC;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_get_inbox(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_get_inbox(uuid) TO authenticated,service_role;
