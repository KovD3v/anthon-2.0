import { getAuthUser } from "@/lib/auth";
import { convertGuestForAuthenticatedUser } from "@/lib/guest-conversion";

export async function POST() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const outcome = await convertGuestForAuthenticatedUser(user.id);
  return Response.json({ outcome });
}
