// Dashboard: today's to-do list and the status of each pipeline, built
// from every other module. Pure functions, tested in tests/dashboard.test.js.
//
// The to-do list covers the four things from the brief:
//   enquiries not answered in time   (setting: 24 hours)
//   options expiring                  (setting: 3 days)
//   payments due                      (setting: 14 days) charter payments and sale deposits
//   certificates expiring             (setting: 60 days) yacht and crew
// Red items come first, then amber; within each, the soonest first.

import { needsReply, statusCounts, STATUSES } from './enquiries.js';
import { optionStatus, findClashes } from './calc/availability.js';
import { contractSchedule } from './contracts.js';
import { complianceList } from './compliance.js';
import { memberStatus, certLabel } from './crew.js';
import { dealProgress, depositStatus, DEAL_STAGES } from './deals.js';
import { LISTING_STATUSES } from './listings.js';
import { formatMoney } from './calc/currency.js';
import { formatDate } from './calc/dates.js';

const value = (settings, id, fallback) => settings.find((s) => s.id === id)?.value ?? fallback;
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

export function todoList({ data, settings, rates, today, now }) {
  const replyHours = value(settings, 'alerts.enquiryReplyHours', 24);
  const optionDays = value(settings, 'alerts.optionExpirySoonDays', 3);
  const amberDays = value(settings, 'alerts.expiryAmberDays', 60);
  const items = [];
  const yachtName = (id) => data.yachts.find((y) => y.id === id)?.name ?? 'Yacht';
  const managedName = (id) => data.managedYachts.find((y) => y.id === id)?.name ?? 'Yacht';

  // 1. Enquiries waiting for a first reply.
  for (const e of data.enquiries) {
    if (!needsReply(e, now, replyHours)) continue;
    const hours = Math.floor((new Date(now) - new Date(e.receivedAt)) / 3600000);
    items.push({
      tone: 'red', area: 'Charter', sort: e.receivedAt.slice(0, 10),
      text: `Reply to ${e.clientName}: enquiry waiting ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`}.`,
      link: `#/enquiries/${e.id}`,
    });
  }

  // 2. Options expiring or expired, and calendar clashes.
  for (const e of data.availability) {
    const status = optionStatus(e, today, optionDays);
    if (!status || status.tone === 'neutral') continue;
    items.push({
      tone: status.tone, area: 'Charter management', sort: e.expiresOn ?? today,
      text: `${e.type === 'option1' ? 'First' : 'Second'} option on ${yachtName(e.yachtId)} for ${e.label || 'a client'}: ${lowerFirst(status.text)}.`,
      link: `#/availability/${e.yachtId}`,
    });
  }
  const yachtIds = [...new Set(data.availability.map((e) => e.yachtId))];
  for (const id of yachtIds) {
    for (const clash of findClashes(data.availability.filter((e) => e.yachtId === id), today)) {
      items.push({ tone: 'red', area: 'Charter management', sort: today, text: `${yachtName(id)}: ${clash.message}`, link: `#/availability/${id}` });
    }
  }

  // 3. Payments due: charter payments, then sale deposits.
  for (const c of data.contracts) {
    const enquiry = data.enquiries.find((e) => e.id === c.enquiryId);
    const yacht = data.yachts.find((y) => y.id === c.yachtId);
    if (!enquiry || !yacht || ['Lost', 'Completed'].includes(enquiry.status)) continue;
    const s = contractSchedule({ contract: c, enquiry, yacht, settings, rates, today });
    if (!s.ok) continue;
    for (const p of s.payments) {
      if (p.status.tone !== 'red' && p.status.tone !== 'amber') continue;
      items.push({
        tone: p.status.tone, area: 'Charter', sort: p.dueDate,
        text: `${enquiry.clientName}: ${p.id === 'apa' ? 'APA' : p.id} of ${formatMoney(p.amount, s.currency)} on ${yacht.name}, ${lowerFirst(p.status.text)}.`,
        link: `#/contracts/${enquiry.id}`,
      });
    }
  }
  for (const d of data.deals) {
    const status = depositStatus(d, settings, today);
    if (status.tone !== 'red' && status.tone !== 'amber') continue;
    const listing = data.forSale.find((b) => b.id === d.listingId);
    items.push({
      tone: status.tone, area: 'Sales', sort: today,
      text: `Sale deposit for ${listing?.name ?? 'a boat'} (${d.buyer}): ${lowerFirst(status.text)}.`,
      link: `#/deals/${d.id}`,
    });
  }

  // 4. Certificates expiring: yacht compliance, then crew.
  for (const i of complianceList(data.compliance, today, amberDays)) {
    if (i.status.tone === 'green') continue;
    items.push({
      tone: i.status.tone, area: 'Yacht management', sort: i.expiresOn ?? today,
      text: `${managedName(i.yachtId)}: ${i.title}, ${lowerFirst(i.status.text)}.`,
      link: `#/compliance/${i.yachtId}`,
    });
  }
  for (const m of data.crew) {
    for (const c of memberStatus(m, today, amberDays).needsAction) {
      items.push({
        tone: c.status.tone, area: 'Yacht management', sort: c.expiresOn ?? today,
        text: `${m.name} (${m.role}): ${c.missing ? c.status.text : `${c.type === 'other' ? c.detail : certLabel(c.type)}, ${lowerFirst(c.status.text)}`}.`,
        link: `#/crew/${m.id}`,
      });
    }
  }

  const rank = { red: 0, amber: 1 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || a.sort.localeCompare(b.sort));
}

// Counts for each pipeline.
export function pipelines(data, settings, today) {
  const amberDays = value(settings, 'alerts.expiryAmberDays', 60);
  const deals = data.deals.map((d) => dealProgress(d));
  const listingStatus = (b) => b.status ?? 'Active';
  const compliance = complianceList(data.compliance, today, amberDays);
  const crewWorst = data.crew.map((m) => memberStatus(m, today, amberDays).worst);

  return {
    charter: { total: data.enquiries.length, counts: statusCounts(data.enquiries), order: STATUSES },
    sales: {
      total: data.forSale.length,
      counts: LISTING_STATUSES.map((status) => ({ status, count: data.forSale.filter((b) => listingStatus(b) === status).length })),
    },
    deals: {
      total: data.deals.length,
      counts: [
        ...DEAL_STAGES.map((st) => ({ status: `Next: ${st.label}`, count: deals.filter((p) => p.current?.id === st.id).length })),
        { status: 'Complete', count: deals.filter((p) => !p.current).length },
      ].filter((c) => c.count),
    },
    management: {
      compliance: {
        red: compliance.filter((i) => i.status.tone === 'red').length,
        amber: compliance.filter((i) => i.status.tone === 'amber').length,
        green: compliance.filter((i) => i.status.tone === 'green').length,
      },
      crew: {
        red: crewWorst.filter((w) => w === 'red').length,
        amber: crewWorst.filter((w) => w === 'amber').length,
        green: crewWorst.filter((w) => w === 'green').length,
      },
    },
  };
}

export function todayHeading(today) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return `${days[day]} ${formatDate(today)}`;
}
