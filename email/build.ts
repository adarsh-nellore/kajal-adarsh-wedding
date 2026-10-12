// Renders the mockups from rsvp-email.ts with a sample party:
//   node --experimental-strip-types email/build.ts
import { writeFileSync } from "node:fs";
import { coupleEmail, guestEmail, SITE, type Rsvp } from "./rsvp-email.ts";

const base = {
  created_at: "2026-10-12T16:40:00Z",
  email: "priya.shah@gmail.com",
  guests: 1,
  dietary: "Rohan is vegetarian and allergic to tree nuts.",
  note: "Meera has exams that week and is so sad to miss it.\nCan’t wait to see you both!",
  send_copy: true,
  party: "12",
  submission_id: "6f1c2a8e-3b7d-4e0a-9c55-2d8f1b7e4a90",
  submitted_by: "Priya Shah",
};

const party: Rsvp[] = [
  { ...base, id: "1", name: "Priya Shah", attending: true, events: ["welcome-party", "saatak-haldi", "baarat-wedding", "after-party"] },
  { ...base, id: "2", name: "Rohan Shah", attending: true, events: ["baarat-wedding", "welcome-party"] },
  { ...base, id: "3", name: "Meera Shah", attending: false, guests: 0, events: [] },
];

const dir = new URL(".", import.meta.url);
const local = (html: string) => html.replaceAll(SITE + "email/lattice.png", "lattice.png");
for (const [file, mail] of [["rsvp-confirmation", guestEmail(party)], ["rsvp-notification", coupleEmail(party)]] as const) {
  writeFileSync(new URL(file + ".html", dir), local(mail.html));
  writeFileSync(new URL(file + ".txt", dir), `Subject: ${mail.subject}\n\n${mail.text}\n`);
}
