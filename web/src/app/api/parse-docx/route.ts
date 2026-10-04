import mammoth from 'mammoth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // `convertToHtml`, not `extractRawText`. The raw-text extractor returns
    // the words and nothing else: a document's headings, bold, italics,
    // lists and tables were all discarded at import, so a Word file opened
    // in the editor as one undifferentiated block — which is most of what
    // "my upload turned into plain text" describes. The HTML it returns is
    // what the editor stores and what peers diff, and it is what the
    // desktop app has always used for the same file.
    //
    // This does not make the import lossless. A .docx is a ZIP of XML, and
    // DocuSync stores an editable document rather than the file, so the
    // original bytes are not retained and a download builds a new .docx
    // from the edited content. Images and exact styling do not survive.
    const result = await mammoth.convertToHtml({ buffer });
    return NextResponse.json({
      text: result.value,
      // Mammoth reports what it could not represent. Passed through so a
      // caller can tell the user, rather than discarded.
      warnings: (result.messages || []).map((m: { message: string }) => m.message),
    });
  } catch (error) {
    console.error('Failed to parse docx', error);
    return NextResponse.json({ error: 'Failed to parse docx' }, { status: 500 });
  }
}
