import ContentEditorWrapper from "./ContentEditorWrapper";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContentEditorPage({ params }: Props) {
  const { id } = await params;
  return <ContentEditorWrapper planId={id} />;
}
