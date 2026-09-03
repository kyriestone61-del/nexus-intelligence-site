-- Keep the stable internal template code while removing the legacy transcript-only client/operator language.
update public.nexus_action_templates
   set title='Review discovery evidence',
       description='Validate that the authorized discovery evidence packet and captured context are complete enough to diagnose.',
       updated_at=now()
 where code='diagnosis_review_transcript';
