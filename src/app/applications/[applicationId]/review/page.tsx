import { AppNav } from "@/components/AppNav";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";

type ReviewPageProps = {
  params: Promise<{
    applicationId: string;
  }>;
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { applicationId } = await params;

  return (
    <>
      <AppNav />
      <ReviewWorkspace applicationId={applicationId} />
    </>
  );
}
