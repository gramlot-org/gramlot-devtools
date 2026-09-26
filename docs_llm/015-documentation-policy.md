# 015 · Documentation policy

Document ID: **GDT-015**.

[Paired view](../docs/015-documentation-policy.md).

<a id="gdt-015-005"></a>

## 005 · Identity and pairing

Block ID: **GDT-015-005**.

Constitution section 9 and GC-005; namespace **GDT**; three-digit filenames spaced by five; `docs` and `docs_llm` share paths, IDs and lowercase anchors. Preserve identities, fix links, never reuse retired IDs.

<a id="gdt-015-010"></a>

## 010 · Presentation and publication

Block ID: **GDT-015-010**.

Classic `sphinx_rtd_theme`, Gramlot logo, external/provisional status notice. Public docs follow `main`; the RTD configuration does not connect hosting.

<a id="gdt-015-015"></a>

## 015 · Coverage and checks

Block ID: **GDT-015-015**.

Every numbered guide is paired from inception; entry points, configuration and assets are exempt. Update both views together; `scripts/check_docs.py` validates identities and builds both views with warnings as errors.
