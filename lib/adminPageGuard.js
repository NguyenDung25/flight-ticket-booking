import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminUser } from "@/lib/requireAdminUser";

export async function guardAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  try {
    await requireAdminUser();
  } catch {
    redirect("/");
  }
}
