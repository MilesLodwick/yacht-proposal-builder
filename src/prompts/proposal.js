// Text the user copies out of the app: a prompt to paste into Claude, and
// a ready-to-edit email for when they would rather not use AI.
//
// No API is called. The site is public, so it holds no keys: the user
// copies the prompt and pastes it into Claude themselves.
//
// Both take the output of proposalContent() in src/proposal.js, so the
// figures are worked out once and are the same everywhere.

// A prompt asking Claude to draft the proposal email.
export function buildProposalPrompt(c) {
  const yachts = c.yachts.map((y, i) => {
    if (!y.ok) return `${i + 1}. ${y.name} (${y.specs}). ${y.reason}: do not quote a price for this yacht.`;
    return [
      `${i + 1}. ${y.name} (${y.specs})`,
      `   Rate from ${y.weeklyRate}.`,
      ...y.lines.map((l) => `   ${l.label}: ${l.amount}`),
      `   Total: ${y.total}${y.clientTotal ? `, ${y.clientTotal}` : ''}`,
    ].join('\n');
  }).join('\n\n');

  const itinerary = c.itinerary
    ? `\nSUGGESTED ITINERARY (at ${c.itinerary.speedKnots} knots)\n${c.itinerary.days.map((d) => `Day ${d.day}, ${d.date}: ${d.route}${d.detail ? ` (${d.detail})` : ''}${d.notes ? `. ${d.notes}` : ''}`).join('\n')}\n`
    : '';

  return `You are helping a yacht charter broker write a proposal email to a client.

Write the email in British English. Make it warm, professional and concise (under 350 words). Do not use em dashes. Do not invent anything about the yachts, crew or destinations beyond what is given below. Keep every figure exactly as written, and do not recalculate them. Say that rates are indicative and subject to availability and contract. End by offering to hold an option on the client's preferred yacht.

CLIENT
Name: ${c.clientName}
Charter: ${c.dates} (${c.days} days), starting in ${c.startsIn}
Guests: ${c.guests}
Budget: ${c.budget}
${c.clientNotes ? `Notes from the enquiry: ${c.clientNotes}\n` : ''}
YACHTS (indicative figures for these dates)
${yachts}
${itinerary}
POINTS TO INCLUDE
${c.notes.map((n) => `- ${n}`).join('\n')}
`;
}

// A plain email the user can copy and edit, with a subject line.
export function buildProposalEmail(c) {
  const yachts = c.yachts.map((y) => {
    if (!y.ok) return `${y.name} (${y.specs})\n${y.reason}. I will confirm the rate for your dates.`;
    return `${y.name} (${y.specs})\nTotal for your dates: ${y.total}${y.clientTotal ? `, ${y.clientTotal}` : ''}\n${y.lines.map((l) => `  ${l.label}: ${l.amount}`).join('\n')}`;
  }).join('\n\n');

  const itinerary = c.itinerary
    ? `\nA possible itinerary:\n${c.itinerary.days.map((d) => `  Day ${d.day}: ${d.route}`).join('\n')}\n`
    : '';

  return `Subject: Your yacht charter proposal, ${c.dates}

Dear ${c.clientName.replace(/^The /, '')},

Thank you for your enquiry. For your ${c.days}-day charter from ${c.dates}, starting in ${c.startsIn} for ${c.guests} guests, I have selected three yachts that suit your plans.

${yachts}
${itinerary}
Please note:
${c.notes.map((n) => `- ${n}`).join('\n')}

If one of these appeals, I would be happy to hold an option on it while you decide.

Kind regards,

[Your name]
`;
}
