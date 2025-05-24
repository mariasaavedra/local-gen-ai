import { withReferralsEmbedToken } from "@/lib/embed/referrals/auth";
import { generateRandomName } from "@/lib/names";
import { LeaderboardPartnerSchema } from "@/lib/zod/schemas/partners";
import { prisma } from "@dub/prisma";
import { OG_AVATAR_URL } from "@dub/utils";
import { NextResponse } from "next/server";
import z from "node_modules/zod/lib";

// GET /api/embed/referrals/leaderboard – get leaderboard for a program
export const GET = withReferralsEmbedToken(async ({ program }) => {
  const partners = await prisma.$queryRaw`
      SELECT 
        p.id,
        p.name,
        COALESCE(metrics.totalClicks, 0) as totalClicks,
        COALESCE(metrics.totalLeads, 0) as totalLeads,
        COALESCE(metrics.totalSales, 0) as totalSales,
        COALESCE(metrics.totalSaleAmount, 0) as totalSaleAmount
      FROM 
        ProgramEnrollment pe
      INNER JOIN 
        Partner p ON p.id = pe.partnerId
      LEFT JOIN (
        SELECT 
          partnerId,
          SUM(clicks) as totalClicks,
          SUM(leads) as totalLeads,
          SUM(sales) as totalSales,
          SUM(saleAmount) as totalSaleAmount
        FROM Link
        WHERE programId = ${program.id}
        GROUP BY partnerId
      ) metrics ON metrics.partnerId = pe.partnerId
      WHERE 
        pe.programId = ${program.id}
        AND pe.status = 'approved'
      ORDER BY 
        totalSaleAmount DESC,
        totalLeads DESC,
        totalClicks DESC
      LIMIT 20`;

  // @ts-ignore
  const response = partners.map((partner) => ({
    id: partner.id,
    name: generateRandomName(partner.id),
    image: `${OG_AVATAR_URL}${partner.id}`,
    clicks: Number(partner.totalClicks),
    leads: Number(partner.totalLeads),
    sales: Number(partner.totalSales),
    saleAmount: Number(partner.totalSaleAmount),
  }));

  return NextResponse.json(z.array(LeaderboardPartnerSchema).parse(response));
});
