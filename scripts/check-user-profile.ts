/**
 * Quick script to check user profile
 */

import { prisma } from "../src/lib/db";

async function checkProfile() {
  const user = await prisma.user.findFirst({
    include: {
      profile: true,
    },
  });

  console.log("User:", JSON.stringify(user, null, 2));
}

checkProfile()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
