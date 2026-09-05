from pathlib import Path
import re
import sys


def remediate(text: str) -> str:
    # Associate a label with the immediately following form control when the existing
    # HTML already visually groups them in the same .field. This is deliberately
    # conservative: labels that are not immediately followed by a control are untouched.
    pattern = re.compile(
        r'<label(?![^>]*\bfor=)(?P<attrs>[^>]*)>(?P<label>.*?)</label>'
        r'(?P<space>\s*)<(?P<tag>input|select|textarea)(?P<control>[^>]*\bid="(?P<id>[^"]+)"[^>]*)>',
        re.IGNORECASE | re.DOTALL,
    )

    def label_repl(match):
        control_id = match.group('id')
        return (
            f'<label for="{control_id}"{match.group("attrs")}>{match.group("label")}</label>'
            f'{match.group("space")}<{match.group("tag")}{match.group("control")}>'
        )

    text = pattern.sub(label_repl, text)

    # Give modal shells dialog semantics. A generic aria-label is safer than leaving an
    # unnamed dialog; individual reset components may replace it with aria-labelledby.
    text = re.sub(
        r'<div\s+id="(?P<id>[^"]+)"\s+class="modal"(?![^>]*\brole=)(?P<rest>[^>]*)>',
        lambda m: f'<div id="{m.group("id")}" class="modal" role="dialog" aria-modal="true" aria-label="Relystra workspace dialog"{m.group("rest")}>',
        text,
        flags=re.IGNORECASE,
    )

    # Add a keyboard skip link and a stable main target. Keep this idempotent.
    if 'class="nexus-skip-link"' not in text:
        text = text.replace(
            '<body class="portal-body">',
            '<body class="portal-body">\n<a class="nexus-skip-link" href="#nexusMainContent">Skip to main content</a>',
            1,
        )
    if 'id="nexusMainContent"' not in text:
        text = text.replace('<main class="main">', '<main id="nexusMainContent" class="main" tabindex="-1">', 1)

    return text


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'portal.html')
    original = path.read_text(encoding='utf-8')
    updated = remediate(original)
    path.write_text(updated, encoding='utf-8')
    print(f'Remediated {path}: {original != updated}')


if __name__ == '__main__':
    main()
