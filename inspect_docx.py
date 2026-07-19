from docx import Document

doc = Document('atividademicroservicos.docx')
for i, p in enumerate(doc.paragraphs):
    if len(p.text.strip()) > 0:
        print(f"[{i}] {p.text[:50]}...")
