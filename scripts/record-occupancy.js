const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ICAL_URL = 'https://www.airbnb.fr/calendar/ical/734016384586290594.ics?t=f0132a0b8db74ee79f67e93aa267d1f0';

function fetchIcal(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseIcalDate(s) {
  return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
}

function parseEvents(text) {
  const events = [];
  text.split('BEGIN:VEVENT').slice(1).forEach(block => {
    const sm = block.match(/DTSTART[^:]*:(\d{8})/);
    const em = block.match(/DTEND[^:]*:(\d{8})/);
    const nm = block.match(/SUMMARY:(.*)/);
    if (!sm || !em) return;
    const start = parseIcalDate(sm[1]);
    const end   = parseIcalDate(em[1]);
    end.setDate(end.getDate() - 1);
    const summary   = (nm ? nm[1] : '').replace(/\r/g,'').trim();
    const isBlocked = /not available/i.test(summary);
    events.push({ start, end, isBlocked });
  });
  return events;
}

function calcOccupancy(events, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let reserved = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (events.some(ev => !ev.isBlocked && date >= ev.start && date <= ev.end)) reserved++;
  }
  let rate = Math.round(reserved / daysInMonth * 100);
  if (rate >= 99) rate = 100;
  return { rate, reserved, total: daysInMonth };
}

async function main() {
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  console.log(`Calcul du taux de remplissage pour ${monthKey}...`);

  const icalText = await fetchIcal(ICAL_URL);
  const events   = parseEvents(icalText);
  const { rate, reserved, total } = calcOccupancy(events, year, month);

  console.log(`${monthKey} : ${rate}% (${reserved}/${total} nuits)`);

  const dashPath = path.join(__dirname, '..', 'index.html');
  let html = fs.readFileSync(dashPath, 'utf8');

  const entry      = `'${monthKey}': { taux: ${rate}, nuits: ${reserved}, total: ${total} }`;
  const existingRe = new RegExp(`'${monthKey}':\\s*\\{[^}]+\\}`);

  if (existingRe.test(html)) {
    html = html.replace(existingRe, entry);
    console.log(`Mise a jour de l'entree ${monthKey}`);
  } else {
    const marker = '// FIN_HISTORIQUE_DN';
    if (!html.includes(marker)) {
      console.error('Marqueur FIN_HISTORIQUE_DN introuvable dans index.html');
      process.exit(1);
    }
    html = html.replace(marker, `${entry},\n    ${marker}`);
    console.log(`Nouvelle entree ajoutee : ${monthKey}`);
  }

  fs.writeFileSync(dashPath, html);
  console.log('Dashboard mis a jour avec succes.');
}

main().catch(err => { console.error(err); process.exit(1); });
