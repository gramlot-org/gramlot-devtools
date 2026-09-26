# 015 · Documentation policy

Document ID: **GDT-015**.

[Paired view](../docs_llm/015-documentation-policy.md).

<a id="gdt-015-005"></a>

## 005 · Identity and pairing

Block ID: **GDT-015-005**.

Follow the Gramlot constitution section 9 and core guide GC-005. This repository uses namespace **GDT**. Guide filenames use three digits initially spaced by five. The expanded view (`docs`) and the concise view (`docs_llm`) share paths, document IDs, block IDs and explicit lowercase anchors. Preserve identities across moves and update links; never reuse retired IDs.

<a id="gdt-015-010"></a>

## 010 · Presentation and publication

Block ID: **GDT-015-010**.

Use Sphinx with the classic `sphinx_rtd_theme`, the Gramlot logo and the status notice of an external, provisional tool. Public documentation follows `main`. The Read the Docs configuration does not mean that hosting is connected.

<a id="gdt-015-015"></a>

## 015 · Coverage and checks

Block ID: **GDT-015-015**.

All numbered guides have paired paths and stable identities from inception. Entry points, configuration, requirements and assets are exempt from numbering. Update both views together. `python scripts/check_docs.py` validates pairing and identities and builds both views with warnings as errors.
