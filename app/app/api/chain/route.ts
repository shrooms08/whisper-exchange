// Single read-only chain endpoint. Server-side fetches Listing + Purchase +
// Agent + Rating accounts via Helius (key never reaches the client), runs
// them through the pure transformers, returns a DashboardPayload JSON.
//
// Polled by app/page.tsx every 2s.

import { NextResponse } from 'next/server';

import {
  fetchAgents,
  fetchCurrentSlot,
  fetchListings,
  fetchPurchases,
  fetchRatings,
} from '../../../lib/chain';
import { buildDashboard } from '../../../lib/transform';

export const dynamic = 'force-dynamic'; // never cache; we want fresh chain reads

export async function GET() {
  try {
    const [listings, purchases, agents, ratings, currentSlot] = await Promise.all([
      fetchListings(),
      fetchPurchases(),
      fetchAgents(),
      fetchRatings(),
      fetchCurrentSlot(),
    ]);

    const payload = buildDashboard(
      listings.results,
      purchases.results,
      agents.results,
      ratings.results,
      currentSlot,
    );

    return NextResponse.json({
      ok: true,
      payload,
      skipped: {
        listings: listings.skipped,
        purchases: purchases.skipped,
        agents: agents.skipped,
        ratings: ratings.skipped,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err).slice(0, 240) },
      { status: 500 },
    );
  }
}
