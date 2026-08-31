import unittest
from remediate_portal_accessibility import remediate


class AccessibilityRemediationTests(unittest.TestCase):
    def test_labels_dialog_and_skip_link_are_added(self):
        source='''<!doctype html><html><body class="portal-body">
        <main class="main"><div class="field"><label>Email</label><input id="email"></div></main>
        <div id="taskModal" class="modal"><div class="modal-card"><h2>Add action</h2></div></div>
        </body></html>'''
        out=remediate(source)
        self.assertIn('<label for="email">Email</label>',out)
        self.assertIn('id="taskModal" class="modal" role="dialog" aria-modal="true"',out)
        self.assertIn('class="nexus-skip-link" href="#nexusMainContent"',out)
        self.assertIn('<main id="nexusMainContent" class="main" tabindex="-1">',out)

    def test_remediation_is_idempotent(self):
        source='''<body class="portal-body"><a class="nexus-skip-link" href="#nexusMainContent">Skip to main content</a><main id="nexusMainContent" class="main" tabindex="-1"><label for="email">Email</label><input id="email"></main><div id="m" class="modal" role="dialog" aria-modal="true" aria-label="Existing"></div></body>'''
        once=remediate(source)
        twice=remediate(once)
        self.assertEqual(once,twice)

    def test_existing_for_attribute_is_preserved(self):
        source='<body class="portal-body"><main class="main"><label for="x">Name</label><input id="x"></main></body>'
        out=remediate(source)
        self.assertEqual(out.count('for="x"'),1)


if __name__=='__main__':
    unittest.main()
