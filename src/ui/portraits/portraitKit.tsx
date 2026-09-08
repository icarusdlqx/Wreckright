import type { PilotAppearance as Appearance } from '../../schema/pilotAppearance';

export function PortraitUniform({ appearance }: { appearance: Appearance }) {
  const { jacket, accent, kit } = appearance;
  return <g>
    <path d="M5 200L14 162Q27 148 58 143H100Q134 147 148 165L159 200Z" fill={jacket} />
    <path d="M14 164L33 155 28 185 25 200H5ZM113 150L139 158 150 200H136Z" fill="#0b222b" opacity=".35" />
    <path d="M28 157L55 144 65 157M105 144L131 157" fill="none" stroke="#e9e0c4" strokeWidth="2" opacity=".32" />
    {kit === 'workcoat' ? <><path d="M55 142L79 159 65 177 45 151M104 143L79 159 91 178 120 155" fill="#233a3e" /><path d="M78 165V200M28 180H58V198H28" fill="none" stroke="#d3c9ad" strokeWidth="1.5" opacity=".5" /><path d="M120 171L133 174 130 187 117 184Z" fill={accent} /><path d="M26 167L37 170" stroke={accent} strokeWidth="5" /></> : null}
    {kit === 'flight_vest' ? <><path d="M35 153L56 146 67 170 77 185 97 165 107 146 128 157 120 200H39Z" fill="#182e36" /><path d="M42 169L61 175 60 193 40 190ZM104 172L120 164 118 190 101 195Z" fill={jacket} /><path d="M77 174V200" stroke={accent} strokeWidth="5" /><rect x="39" y="159" width="15" height="6" fill={accent} /></> : null}
    {kit === 'officer' ? <><path d="M57 142L80 154 102 143 111 158 82 174 49 158Z" fill="#152e39" /><path d="M80 155V199M81 156L105 146" stroke={accent} strokeWidth="2" /><path d="M24 156L45 151 49 159 27 165ZM115 151L136 157 133 165 112 159Z" fill={accent} /><path d="M108 181H129M108 186H124" stroke="#e3dac4" strokeWidth="3" /></> : null}
    {kit === 'scarf' ? <><path d="M52 137L77 148 102 137 118 154 95 173 76 168 57 178 40 157Z" fill={accent} /><path d="M62 169L79 166 72 199H52Z" fill={accent} /><path d="M46 153L70 160 106 149M55 163L83 166 107 156M61 179L69 181M58 188L66 190" fill="none" stroke="#19343c" strokeWidth="3" opacity=".35" /></> : null}
    {kit === 'harness' ? <><path d="M31 154L57 163 70 200H54L43 174 29 170ZM116 152L105 167 92 200H107L117 179 132 160Z" fill="#1c2e31" /><path d="M40 157L64 199M125 157L100 199" stroke={accent} strokeWidth="3" /><rect x="50" y="175" width="15" height="12" rx="2" fill="#c0bcaa" /><rect x="96" y="175" width="15" height="12" rx="2" fill="#c0bcaa" /><path d="M54 180H61M100 180H107" stroke="#253840" strokeWidth="3" /></> : null}
  </g>;
}

export function PortraitAccessories({ appearance }: { appearance: Appearance }) {
  const { accessory, accent, detail, hair } = appearance;
  return <g>
    {accessory === 'cap' ? <><path d="M42 52L46 29 99 24 112 38 111 56Z" fill={accent} /><path d="M40 48Q79 42 118 55L120 63Q85 57 39 59Z" fill="#2b4449" /><path d="M62 34H79V43H62" fill="#1c343b" /><path d="M48 34L51 46" stroke="#fff4d5" opacity=".35" strokeWidth="2" /></> : null}
    {accessory === 'bandana' ? <><path d="M43 47Q78 33 113 48L114 59Q78 45 43 59Z" fill={accent} /><path d="M111 52L127 60 123 75 112 59 118 87 110 91 107 57Z" fill={accent} /><path d="M57 48L68 45M78 44L88 46" stroke="#fff1d0" opacity=".6" strokeWidth="2" /></> : null}
    {accessory === 'goggles' ? <><path d="M42 47L116 47" stroke="#18282d" strokeWidth="9" /><path d="M48 38L72 36 77 43 96 36 115 41 112 56 90 56 80 49 72 57 49 56Z" fill="#243e44" stroke="#cfb989" strokeWidth="2.5" /><path d="M54 42L68 41M95 41L107 44" stroke={accent} strokeWidth="3.5" /></> : null}
    {accessory === 'glasses' ? <g stroke="#163039" strokeWidth="2.5" fill="#bde5d9" fillOpacity=".16"><rect x="48" y="64" width="25" height="18" rx="6" /><rect x="88" y="64" width="25" height="18" rx="6" /><path d="M73 70Q81 67 88 70M43 65L48 69M114 69L118 65" fill="none" /></g> : null}
    {detail === 'visor' ? <><path d="M44 63L115 62 110 82 87 85 79 76 71 85 46 82Z" fill="#183b46" stroke="#a6bcb1" strokeWidth="1.5" /><path d="M49 67L71 67M91 67L109 67" stroke={accent} strokeWidth="3" /><path d="M62 64L55 80M101 63L94 81" stroke="#e0eee3" strokeWidth="3" opacity=".35" /></> : null}
    {accessory === 'headset' || detail === 'earpiece' ? <><path d="M40 77Q32 26 81 23Q123 25 121 72" fill="none" stroke="#162d34" strokeWidth={accessory === 'headset' ? 7 : 3} /><rect x="34" y="66" width="15" height="28" rx="5" fill="#263f45" stroke="#aab7a8" strokeWidth="1.5" /><rect x="117" y="68" width="9" height="23" rx="3" fill="#263f45" /><path d="M39 92L51 111 65 114" fill="none" stroke="#1b3035" strokeWidth="4" /><path d="M60 113L69 114" stroke={accent} strokeWidth="5" strokeLinecap="round" /><path d="M39 72V85" stroke={accent} strokeWidth="3" /></> : null}
    {appearance.age === 'veteran' && appearance.style !== 'bald' && appearance.style !== 'shaved' ? <path d="M48 57L51 70M108 54L110 69" stroke="#e4dfcf" opacity=".5" strokeWidth="4" /> : null}
    {appearance.style === 'bald' ? <path d="M55 48Q70 35 91 41" stroke={hair} opacity=".1" fill="none" strokeWidth="2" /> : null}
  </g>;
}
