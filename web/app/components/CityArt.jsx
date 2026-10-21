export default function CityArt() {
  return <div className="art" aria-hidden="true">
    <svg className="map" viewBox="0 0 560 560" fill="none">
      <defs><pattern id="city-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" stroke="#565d40" strokeWidth=".5" /></pattern></defs>
      <path fill="url(#city-grid)" d="M0 0h560v560H0z" />
      <g stroke="#778059" strokeWidth="1"><path d="M0 144h102l48-48h125l61 61h224M0 389h113l75-75h157l39 39h176M100 0v109l65 65v233l-36 36v117M430 0v161l-62 62v196l57 57v84M0 247h88l59 59h299l48-48h66" /><path d="M0 159h108l48-48h113l61 61h230M0 404h119l75-75h145l39 39h182M85 0v115l65 65v221l-36 36v123M445 0v167l-62 62v184l57 57v90" opacity=".5" /></g>
      <g stroke="#aebd6c" strokeDasharray="3 6" opacity=".65"><path d="M280 0v560M0 280h560" /></g>
      <g stroke="#afb894" strokeWidth="1"><path d="M45 44h47v45H45zM195 25h45v47h-45zM456 76h68v49h-68zM22 448h57v69H22zM192 460h56v70h-56zM458 405h65v55h-65zM459 485h34v42h-34zM24 182h40v45H24zM490 187h45v42h-45zM291 456h51v32h-51zM310 40h53v48h-53z" /></g>
      <g fill="#dfee39"><rect x="161" y="169" width="7" height="7" /><rect x="379" y="349" width="7" height="7" /><rect x="125" y="440" width="7" height="7" /><rect x="427" y="73" width="4" height="4" /></g>
    </svg>
    <div className="crosshair" /><div className="target-ring" /><div className="target-ring inner" />
    <div className="art-index">[ A/X ]</div>
    <svg className="sigil" viewBox="0 0 440 440" fill="none">
      <g className="sigil-shadow"><path d="M54 325 174 98h69L359 325h-86l-65-135-68 135Z" /><path d="m125 332 86-157 97 179-95-49Z" /></g>
      <g className="sigil-main"><path d="m72 268 89-167 73-17 88 167-72 2-44-93-57 108ZM44 317l23-37h76l-23 46Zm218-51 67-4 37 63-72-6Z" /><path d="m169 304 38-68 32 63-31-12Z" /></g>
      <g className="sigil-accent"><path d="m57 275 87-8-5 11-88 8ZM249 252l93-6 4 10-90 7ZM166 105l20-37h43l-10 21Z" /><path d="m92 350 216-9-5 6-215 10Z" /></g>
      <g stroke="#f2f2e9" strokeWidth="3"><path d="m87 119 31 8m-16-20 1 34M311 360l32-9m-24-7 17 25M300 96l11-17m-20 7 25 3" /></g>
    </svg>
    <div className="scan" />
    <div className="access-strip">// THE CITY IS OUR CANVAS</div>
    <div className="art-label top">VISUAL ARCHIVE<br /><strong>AXM_001 / CITY GRID</strong></div>
    <div className="art-label side">NO RULES FOR IMAGINATION / AXIOM</div>
    <div className="art-label bottom">A NEW WORLD IS TAKING SHAPE<br /><strong>STAND BY FOR THE NEXT TRANSMISSION_</strong></div>
  </div>;
}
