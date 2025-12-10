// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("⚔️ Seeding Warcraft-themed test data...");

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log("Seed skipped: users already exist.");
    return;
  }


  const passwords = {
    lichKing: "Frostmourne123!",
    farseer: "SpiritWolf123!",
    footman: "ShieldHold123!",
    grunt: "ForTheHorde123!",
  };

  // LEAD：Lich King (Arthas)
  const lichKing = await prisma.user.create({
    data: {
      email: "lichking@hirehub.local",
      passwordHash: bcrypt.hashSync(passwords.lichKing, 10),
      name: "The Lich King (Arthas)",
      role: "LEAD",
      photoUrl:
        "https://res.cloudinary.com/dtcgrtslg/image/upload/v1762901873/%E5%B7%AB%E5%A6%96%E7%8E%8B_af0exh.png",
    },
  });

  // HR：Farseer
  const farseer = await prisma.user.create({
    data: {
      email: "farseer@hirehub.local",
      passwordHash: bcrypt.hashSync(passwords.farseer, 10),
      name: "Farseer",
      role: "HR",
      photoUrl:
        "https://res.cloudinary.com/dtcgrtslg/image/upload/v1762901308/icon_11_irsnce.jpg",
    },
  });

  // Candidate 1：Footman (Human)
  const footman = await prisma.candidate.create({
    data: {
      fullName: "Footman (Human)",
      email: "footman@hirehub.local",
      phone: "+1-555-HUMAN",
      photoUrl:
        "https://res.cloudinary.com/dtcgrtslg/image/upload/v1762901356/icon_02_bdn9lm.jpg",
    },
  });

  // Candidate 2：Grunt (Orc)
  const grunt = await prisma.candidate.create({
    data: {
      fullName: "Grunt (Orc)",
      email: "grunt@hirehub.local",
      phone: "+1-555-ORCISH",
      photoUrl:
        "https://res.cloudinary.com/dtcgrtslg/image/upload/v1762901345/icon_01_hkxxwn.jpg",
    },
  });

 
  const someJobs = await prisma.jOB.findMany({
    take: 5,
    orderBy: { id: "asc" },
  });
  await Promise.all(
    someJobs.map((j) =>
      prisma.jobOwner.upsert({
        where: { jobId: j.id }, 
        update: { ownerId: farseer.id },
        create: { jobId: j.id, ownerId: farseer.id },
      })
    )
  );

  console.log("✅ Seed complete. Test accounts:");
  console.table([
    { role: "LEAD", name: lichKing.name, email: lichKing.email, password: passwords.lichKing },
    { role: "HR", name: farseer.name, email: farseer.email, password: passwords.farseer },
    { role: "CANDIDATE", name: footman.fullName, email: footman.email, password: passwords.footman },
    { role: "CANDIDATE", name: grunt.fullName, email: grunt.email, password: passwords.grunt },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
