import { ChatRoom } from "@/components/chat/ChatRoom";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoom projectId={id} />;
}
