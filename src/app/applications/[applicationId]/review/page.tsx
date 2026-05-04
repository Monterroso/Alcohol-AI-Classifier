import { AppNav } from "@/components/AppNav";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";
import { readApplicationDatabase } from "@/features/applications/server-repository";
import { getReviewAnalysis } from "@/features/applications/selectors";
import { notFound } from "next/navigation";

type ReviewPageProps = {
  params: Promise<{
    applicationId: string;
  }>;
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { applicationId } = await params;
  const analysis = getReviewAnalysis(await readApplicationDatabase(), applicationId);

  if (!analysis) {
    notFound();
  }

  return (
    <>
      <AppNav />
      <ReviewWorkspace applicationId={applicationId} initialAnalysis={analysis} />
    </>
  );
}
