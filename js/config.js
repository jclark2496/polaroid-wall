// ─── EVENT CONFIGURATION ────────────────────────────────────────────────────
// Edit these values to customize the app for your event.
const CONFIG = {
  names:         'Alex & Jordan',       // displayed in hero and header
  monogram:      'A♡J',                 // short monogram for header + footer
  eventDate:     '2027-06-19T17:00:00-05:00', // ISO datetime of main event
  eventLabel:    'The Big Day',         // shown in sticky header
  venue:         '[Your Venue]',        // short venue name for footer
  location:      '[Your City]',         // city for footer
  headerRight:   'Jun 19, 2027<br>[Venue]', // top-right header text (HTML ok)
  heroDate:      'Saturday, June 19, 2027 · 5:00 PM',
  heroVenue:     '[Your Venue Name · Your City]',
  countdownText: 'until the big day.',
  // Filter chips — one entry per event day. id must be YYYY-MM-DD in local tz.
  days: [
    { id:'2027-06-17', label:'Arrival' },
    { id:'2027-06-18', label:'Rehearsal' },
    { id:'2027-06-19', label:'The Big Day', wedding:true },
    { id:'2027-06-20', label:'Farewell' },
  ]
};
