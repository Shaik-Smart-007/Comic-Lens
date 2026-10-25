export interface SampleComic {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  svgDataUrl: string;
  defaultDraft: {
    page_summary: string;
    reading_order_note: string;
    panels: Array<{
      sequence: number;
      visual_description: string;
      verbatim_transcription: string;
      uncertainty: string;
    }>;
    overall_uncertainties: string[];
  };
}

function createSvgDataUrl(svgContent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;
}

export const SAMPLE_COMICS: SampleComic[] = [
  {
    id: 'tintin_chateau',
    title: 'Tintin — Château de Moulinsart (3 Panels)',
    description: 'Franco-Belgian ligne claire style with dialogue, narration caption, and sound effect.',
    width: 1200,
    height: 600,
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
        <rect width="1200" height="600" fill="#f8fafc"/>
        
        <!-- Panel 1 -->
        <g id="panel1">
          <rect x="20" y="20" width="370" height="560" fill="#fef3c7" stroke="#1e293b" stroke-width="5"/>
          <text x="35" y="45" font-family="monospace" font-size="12" fill="#64748b">PANEL 1</text>
          
          <!-- Speech bubble 1: Tintin -->
          <path d="M 40 70 L 370 70 A 15 15 0 0 1 385 85 L 385 190 A 15 15 0 0 1 370 205 L 180 205 L 140 240 L 160 205 L 40 205 A 15 15 0 0 1 25 190 L 25 85 A 15 15 0 0 1 40 70 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
          <text x="45" y="105" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">Great Scott, Snowy! Look at</text>
          <text x="45" y="135" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">that strange carved statue</text>
          <text x="45" y="165" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">hidden on the mantelpiece!</text>

          <!-- Snowy response bubble -->
          <path d="M 60 480 L 220 480 A 12 12 0 0 1 232 492 L 232 540 A 12 12 0 0 1 220 552 L 140 552 L 120 575 L 125 552 L 60 552 A 12 12 0 0 1 48 540 L 48 492 A 12 12 0 0 1 60 480 Z" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <text x="65" y="520" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="16" fill="#000000">WOOF! GRRRR!</text>
        </g>

        <!-- Panel 2 -->
        <g id="panel2">
          <rect x="410" y="20" width="370" height="560" fill="#e0f2fe" stroke="#1e293b" stroke-width="5"/>
          <text x="425" y="45" font-family="monospace" font-size="12" fill="#64748b">PANEL 2</text>
          
          <!-- Speech bubble 2: Captain Haddock -->
          <path d="M 430 70 L 760 70 A 15 15 0 0 1 775 85 L 775 220 A 15 15 0 0 1 760 235 L 580 235 L 550 270 L 565 235 L 430 235 A 15 15 0 0 1 415 220 L 415 85 A 15 15 0 0 1 430 70 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
          <text x="435" y="105" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">Billions of blue blistering</text>
          <text x="435" y="135" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">barnacles! What on earth are</text>
          <text x="435" y="165" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">you shouting about at this</text>
          <text x="435" y="195" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="18" fill="#000000">unearthly hour of the night?</text>
        </g>

        <!-- Panel 3 -->
        <g id="panel3">
          <rect x="800" y="20" width="380" height="560" fill="#f1f5f9" stroke="#1e293b" stroke-width="5"/>
          <text x="815" y="45" font-family="monospace" font-size="12" fill="#64748b">PANEL 3</text>
          
          <!-- Narration caption box -->
          <rect x="820" y="65" width="340" height="60" fill="#fef08a" stroke="#000000" stroke-width="2"/>
          <text x="830" y="90" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="14" fill="#000000">MEANWHILE, OUTSIDE THE</text>
          <text x="830" y="112" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="14" fill="#000000">CHÂTEAU DE MOULINSART...</text>

          <!-- Sound effect -->
          <text x="860" y="260" font-family="Impact, sans-serif" font-size="36" fill="#dc2626" transform="rotate(-5 860 260)">TAP! TAP! TAP!</text>

          <!-- Whisper dialogue bubble -->
          <path d="M 830 380 L 1150 380 A 15 15 0 0 1 1165 395 L 1165 480 A 15 15 0 0 1 1150 495 L 980 495 L 950 535 L 965 495 L 830 495 A 15 15 0 0 1 815 480 L 815 395 A 15 15 0 0 1 830 380 Z" fill="#ffffff" stroke="#000000" stroke-width="2" stroke-dasharray="4"/>
          <text x="840" y="420" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="16" fill="#000000">Psst! Did anyone see you</text>
          <text x="840" y="445" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="16" fill="#000000">climb the courtyard wall?</text>
        </g>
      </svg>
    `),
    defaultDraft: {
      page_summary: 'A three-panel comic strip in the classic Franco-Belgian ligne claire style. Tintin discovers an anomaly at night, Captain Haddock reacts with his trademark exclamation, and outside the Château de Moulinsart an intruder approaches.',
      reading_order_note: 'Standard horizontal reading order: Panel 1 (left) → Panel 2 (center) → Panel 3 (right). Clear sequential progression.',
      panels: [
        {
          sequence: 1,
          visual_description: 'Pale yellow indoor panel. Two distinct speech bubbles: a prominent upper dialogue bubble and a small vocalization bubble at the lower left.',
          verbatim_transcription: 'Speech bubble: "Great Scott, Snowy! Look at that strange carved statue hidden on the mantelpiece!"\nSpeech bubble: "WOOF! GRRRR!"',
          uncertainty: '',
        },
        {
          sequence: 2,
          visual_description: 'Light blue interior room panel containing a large expressive speech balloon occupying the upper portion of the frame.',
          verbatim_transcription: 'Speech bubble: "Billions of blue blistering barnacles! What on earth are you shouting about at this unearthly hour of the night?"',
          uncertainty: '',
        },
        {
          sequence: 3,
          visual_description: 'Exterior night scene at Château de Moulinsart with a yellow narration caption box at the top, bold crimson sound effect lettering across the center, and a dashed whisper balloon below.',
          verbatim_transcription: 'Narration box: "MEANWHILE, OUTSIDE THE CHÂTEAU DE MOULINSART..."\nSound effect: "TAP! TAP! TAP!"\nSpeech bubble: "Psst! Did anyone see you climb the courtyard wall?"',
          uncertainty: '',
        },
      ],
      overall_uncertainties: [],
    },
  },
  {
    id: 'space_patrol',
    title: 'Orbit 9 — Space Patrol (3 Panels)',
    description: 'Sci-fi comic featuring an astronaut detecting an anomaly on a desolate lunar ridge.',
    width: 900,
    height: 450,
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 450" width="900" height="450">
        <rect width="900" height="450" fill="#0f172a"/>
        <g id="panel1">
          <rect x="15" y="15" width="270" height="420" fill="#1e293b" stroke="#cbd5e1" stroke-width="4" rx="4"/>
          <circle cx="50" cy="50" r="1.5" fill="#f8fafc"/>
          <circle cx="120" cy="80" r="2" fill="#f8fafc"/>
          <path d="M 15 320 Q 150 280 285 340 L 285 435 L 15 435 Z" fill="#334155"/>
          <circle cx="150" cy="240" r="28" fill="#e2e8f0"/>
          <rect x="138" y="232" width="24" height="16" rx="6" fill="#38bdf8"/>
          <rect x="132" y="268" width="36" height="55" rx="8" fill="#e2e8f0"/>
          <rect x="35" y="35" width="230" height="60" rx="12" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <polygon points="120,95 140,95 130,115" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <text x="50" y="60" font-family="sans-serif" font-weight="bold" font-size="14" fill="#000000">HQ, Sector 7 is completely</text>
          <text x="50" y="80" font-family="sans-serif" font-weight="bold" font-size="14" fill="#000000">silent. Commencing scan.</text>
          <text x="25" y="420" font-family="monospace" font-size="12" fill="#94a3b8">PANEL 1</text>
        </g>
        <g id="panel2">
          <rect x="300" y="15" width="285" height="420" fill="#090d16" stroke="#cbd5e1" stroke-width="4" rx="4"/>
          <circle cx="442" cy="220" r="95" fill="#0284c7" fill-opacity="0.2" stroke="#38bdf8" stroke-width="3"/>
          <circle cx="485" cy="180" r="10" fill="#ef4444"/>
          <rect x="315" y="30" width="160" height="36" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>
          <text x="325" y="53" font-family="sans-serif" font-weight="bold" font-size="13" fill="#854d0e">BEEP... BEEP...</text>
          <rect x="325" y="335" width="235" height="55" rx="12" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <polygon points="430,335 445,335 440,315" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <text x="340" y="358" font-family="sans-serif" font-weight="bold" font-size="13" fill="#000000">Wait... thermal pulse at</text>
          <text x="340" y="376" font-family="sans-serif" font-weight="bold" font-size="13" fill="#000000">coordinates 44-Omega!</text>
          <text x="310" y="420" font-family="monospace" font-size="12" fill="#94a3b8">PANEL 2</text>
        </g>
        <g id="panel3">
          <rect x="600" y="15" width="285" height="420" fill="#1e1b4b" stroke="#cbd5e1" stroke-width="4" rx="4"/>
          <polygon points="742,180 775,230 755,290 730,290 710,230" fill="#a855f7" stroke="#e9d5ff" stroke-width="3"/>
          <text x="630" y="100" font-family="Impact, sans-serif" font-size="34" fill="#facc15" stroke="#713f12" stroke-width="1.5" transform="rotate(-10 630 100)">SHZZZZT!</text>
          <rect x="625" y="325" width="240" height="55" rx="12" fill="#ffffff" stroke="#000000" stroke-width="2"/>
          <text x="640" y="350" font-family="sans-serif" font-weight="bold" font-size="14" fill="#000000">That's not space debris...</text>
          <text x="640" y="370" font-family="sans-serif" font-weight="bold" font-size="14" fill="#000000">It's powered!</text>
          <text x="610" y="420" font-family="monospace" font-size="12" fill="#94a3b8">PANEL 3</text>
        </g>
      </svg>
    `),
    defaultDraft: {
      page_summary: 'An astronaut conducts a routine lunar ridge reconnaissance, detects an unexpected thermal signal on a radar scanner, and discovers an active glowing purple crystalline artifact emitting electrical energy.',
      reading_order_note: 'Standard horizontal reading order: Panel 1 (left) → Panel 2 (center) → Panel 3 (right). Clear sequential transitions.',
      panels: [
        {
          sequence: 1,
          visual_description: 'Wide shot of an astronaut in a white spacesuit with a blue reflective visor standing on a cratered lunar ridge beneath a star-filled black sky.',
          verbatim_transcription: 'Speech bubble: "HQ, Sector 7 is completely silent. Commencing scan."',
          uncertainty: '',
        },
        {
          sequence: 2,
          visual_description: 'Close-up perspective of the astronaut holding a circular radar scanner displaying crosshairs and an alarming red target blip flashing at the upper right quadrant.',
          verbatim_transcription: 'Caption: "BEEP... BEEP..."\nSpeech bubble: "Wait... thermal pulse at coordinates 44-Omega!"',
          uncertainty: 'Exact digits on scanner readouts outside the blip are decorative and illegible.',
        },
        {
          sequence: 3,
          visual_description: 'Dramatic low-angle view of a faceted purple crystalline artifact embedded in dark bedrock, radiating bright violet light rays and electrical discharges into the dark sky.',
          verbatim_transcription: 'Sound effect: "SHZZZZT!"\nSpeech bubble: "That\'s not space debris... It\'s powered!"',
          uncertainty: 'The nature and origin of the crystalline structure are deliberately ambiguous in the artwork.',
        },
      ],
      overall_uncertainties: [
        'Astronaut identity cannot be discerned through the opaque reflective helmet visor.',
      ],
    },
  },
];
