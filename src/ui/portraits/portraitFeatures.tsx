import type { PilotAppearance as Appearance } from '../../schema/pilotAppearance';

const HAIR: Record<Appearance['style'], string> = {
  crop: 'M46 68L43 48 54 34 92 30 114 45 116 64 105 55 99 45 65 46 54 57Z',
  sweep: 'M43 73L39 47Q48 25 78 26L107 33 118 49 113 71 103 51 97 42Q83 61 52 60Z',
  braid: 'M44 83Q36 41 56 29Q82 18 105 32L116 51 111 91 121 132 110 153 101 134 99 88 107 51 88 43 59 53 54 80Z',
  shaved: 'M48 53Q51 30 79 29Q106 30 112 54L101 43Q79 37 57 49Z',
  curls: 'M44 72Q32 67 38 54Q28 43 43 39Q39 24 56 26Q61 15 73 24Q86 13 94 27Q112 22 113 38Q128 42 117 54L116 70 104 59 99 48 90 51 78 45 68 53 58 49 54 68Z',
  bob: 'M39 114L38 54Q38 23 78 23Q111 22 122 51L122 117 108 125 103 71 97 45Q81 61 55 65L54 124Z',
  bun: 'M90 27Q88 5 109 11Q129 20 111 39L109 59 104 43Q76 30 52 57L48 75 42 58Q36 30 62 26Z',
  locs: 'M40 87Q32 33 55 27L91 22Q116 27 120 48L124 113 114 137 103 113 102 55 94 44 86 56 79 41 65 56 57 45 55 92 47 127 39 119Z',
  quiff: 'M43 73L40 47 48 32 46 19 68 27 86 15 109 26 116 48 111 72 102 50 84 43 63 49 53 64Z',
  undercut: 'M45 62L46 43 65 28 99 25 115 39 118 60 107 52 103 42 78 48 68 38 51 66Z',
  bald: '',
  high_top: 'M43 66L39 30Q41 19 57 20L101 20 115 33 115 67 104 53 101 42 57 43 54 65Z',
};
const FACES: Record<Appearance['face'], { outline: string; eyeY: number; spread: number; nose: string }> = {
  angular: { outline: 'M49 56L64 40 96 42 111 59 108 95 98 115 79 127 57 113 47 88Z', eyeY: 72, spread: 19, nose: 'M79 73L74 92 82 95' },
  broad: { outline: 'M45 57L59 41 99 41 116 60 113 98 98 120 76 126 52 110 44 86Z', eyeY: 72, spread: 22, nose: 'M79 74L72 92 86 95' },
  oval: { outline: 'M50 57Q55 36 81 37Q108 39 111 63L108 96Q101 120 80 127Q59 120 51 99Z', eyeY: 73, spread: 19, nose: 'M80 75L77 92 83 94' },
  long: { outline: 'M51 52L66 37 94 40 108 56 107 100 94 123 79 134 61 121 50 96Z', eyeY: 72, spread: 18, nose: 'M80 72L74 97 83 99' },
  square: { outline: 'M44 59L57 41 101 42 117 61 113 109 100 125 60 124 46 108Z', eyeY: 74, spread: 22, nose: 'M80 74L73 94 87 96' },
  round: { outline: 'M44 65Q44 38 80 38Q116 39 116 68L113 100Q102 123 79 126Q53 121 46 101Z', eyeY: 74, spread: 22, nose: 'M79 76L75 90 84 93' },
  heart: { outline: 'M48 55Q58 35 81 39Q104 36 114 58L109 91 96 110 80 128 64 115 50 92Z', eyeY: 72, spread: 20, nose: 'M79 74L75 91 82 94' },
};

export function PortraitHair({ appearance }: { appearance: Appearance }) {
  const { hair, style } = appearance;
  return <g fill={hair}><path d={HAIR[style]} />
    {style === 'braid' ? <path d="M107 85L116 99 105 113 117 126 109 140" fill="none" stroke="#eee4ce" strokeWidth="3" opacity=".25" /> : null}
    {style === 'locs' ? <path d="M46 45L48 112M56 32L61 47M90 30L98 48M108 49L114 120" fill="none" stroke="#d4b894" strokeWidth="2.5" opacity=".25" /> : null}
    {style === 'sweep' || style === 'quiff' ? <path d="M49 46Q76 28 103 36M52 51Q76 41 90 35" fill="none" stroke="#e7d4b7" strokeWidth="2" opacity=".21" /> : null}
  </g>;
}

export function PortraitFace({ appearance }: { appearance: Appearance }) {
  const { skin, hair, face, expression, age, detail } = appearance;
  const shape = FACES[face];
  const eyeY = shape.eyeY;
  const left = 80 - shape.spread, right = 80 + shape.spread;
  const open = expression === 'curious' || expression === 'grin' ? 4 : 2.8;
  const brows = expression === 'stern' || expression === 'resolute' ? -3 : expression === 'curious' ? 4 : 1;
  const mouth = expression === 'grin' ? 'M67 107Q81 114 97 103Q84 125 67 107Z'
    : expression === 'wry' ? 'M67 111Q83 113 96 104' : expression === 'stern' ? 'M67 112Q80 108 93 112'
      : expression === 'curious' ? 'M75 110Q83 106 90 110' : 'M68 109Q81 113 93 109';
  return <g>
    <path d="M47 70Q35 66 40 88L49 95M112 70Q124 64 120 86L111 96" fill={skin} />
    <path d={shape.outline} fill={skin} stroke="#172e34" strokeWidth="1.3" />
    <path d="M79 43L98 48 107 64 105 88 96 105 80 113 79 96 87 91 81 77Z" fill="#fff0d0" opacity=".22" />
    <path d="M49 62L59 72 56 92 68 108 83 122 74 127 56 111 47 88Z" fill="#512d32" opacity=".22" />
    <path d={`M${left - 8} ${eyeY - 6 - brows}L${left + 7} ${eyeY - 7}M${right - 7} ${eyeY - 7}L${right + 7} ${eyeY - 6 - (expression === 'wry' ? 5 : brows)}`}
      fill="none" stroke={hair} strokeWidth={face === 'square' || age === 'veteran' ? 4 : 3} strokeLinecap="round" />
    {[left, right].map(x => <g key={x}><path d={`M${x - 6} ${eyeY + 1}Q${x} ${eyeY - open} ${x + 6} ${eyeY + 1}Q${x} ${eyeY + open} ${x - 6} ${eyeY + 1}`} fill="#f0e7d4" />
      <ellipse cx={x + (expression === 'curious' ? 1.5 : 0)} cy={eyeY + .5} rx="2.2" ry="2.7" fill="#18373b" />
      <path d={`M${x - 6} ${eyeY + 1}Q${x} ${eyeY - open} ${x + 6} ${eyeY + 1}`} fill="none" stroke="#302c2b" strokeWidth="1.7" /></g>)}
    <path d={shape.nose} fill="none" stroke="#734b3d" strokeWidth="2" strokeLinecap="round" opacity=".65" />
    <path d={mouth} fill={expression === 'grin' ? '#f6e4cc' : 'none'} stroke="#694236" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M76 118L86 119" stroke="#fff2d4" strokeWidth="2" opacity=".23" />
    {age === 'veteran' ? <path d="M58 55L72 52M83 53L99 55M50 79L58 82M105 81L113 78M59 96L62 106M99 95L97 102" fill="none" stroke="#6a4840" strokeWidth="1.5" opacity=".6" /> : null}
    {detail === 'scar' ? <path d="M102 65L94 92M96 76L102 79M93 84L99 87" fill="none" stroke="#f0c9ac" strokeWidth="2.4" /> : null}
    {detail === 'freckles' ? <path d="M55 85H57M61 89H63M65 84H67M95 86H97M102 85H104M98 90H100" stroke="#81563d" strokeWidth="1.8" /> : null}
    {detail === 'beard' ? <><path d="M49 89L62 100 73 101 78 98 85 98 91 102 101 98 110 87 107 111 95 124 77 130 58 116Z" fill={hair} opacity=".92" /><path d="M65 108Q80 115 96 106" fill="none" stroke={skin} strokeWidth="2" /><path d="M68 117L75 120M86 121L92 117" stroke="#dfd5be" strokeWidth="1.7" opacity=".27" /></> : null}
  </g>;
}
