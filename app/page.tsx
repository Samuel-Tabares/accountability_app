import { redirect } from "next/navigation";
import { dashboardPathForRole, getAuthContext } from "@/src/lib/auth";

export default async function HomePage() {
  const auth = await getAuthContext();
  redirect(auth ? dashboardPathForRole(auth.profile.role) : "/login");
}
