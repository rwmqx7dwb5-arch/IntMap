/* ============================================================================
 *  THE VIEWPOINT RULER  (#R177)
 * ----------------------------------------------------------------------------
 *  ONE definition of "where is the camera", installed into the page by any spec
 *  that needs to check the viewpoint. It exists as a shared file for the same
 *  reason gEye/gSolve exist as one function in the app:
 *
 *  #R172-#R176 each wrote the camera geometry twice — once in the tilt
 *  correction and once in the thing that measured it — and every round the two
 *  copies agreed with each other while disagreeing with the renderer. #R176
 *  wrote down "an error cannot be seen with the yardstick that shares it" and
 *  then built its new yardstick out of its new correction; measured against the
 *  renderer afterwards, the drift it was reporting as 0 m was 7,115 km.
 *
 *  So this reads the camera off the matrix MapLibre ACTUALLY DRAWS WITH: invert
 *  it and intersect two view rays, because every ray meets at the camera
 *  whatever space the matrix is in. It shares no code with the app.
 *
 *  NOT transform.cameraPosition: on the mercator transform that is
 *  inv(viewProj)·(0,0,-1,1), i.e. the NEAR-PLANE centre, which sits nearZ
 *  (= height/50 px) ahead of the camera and shifts with pitch — 223 m at z12,
 *  more than enough to read as a real drift.
 *
 *  Installs window.__eye() → {space, lng, lat, alt} and window.__gap(a,b) → metres.
 * ==========================================================================*/
export const installCameraRuler = () => {
  const m = window.__imap, R = 6371008.8, D = Math.PI / 180;
  const inv = a => { const o = new Float64Array(16);
    const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],
          b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],
          b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
    let d = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06; if (!d) return null; d = 1/d;
    o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*d; o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*d; o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*d; o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*d;
    o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*d; o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*d; o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*d; o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*d;
    o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*d; o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*d; o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*d; o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*d;
    o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*d; o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*d; o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*d; o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*d;
    return o; };
  const xf = (M, v) => { const x=v[0],y=v[1],z=v[2], w=M[3]*x+M[7]*y+M[11]*z+M[15];
    return [(M[0]*x+M[4]*y+M[8]*z+M[12])/w, (M[1]*x+M[5]*y+M[9]*z+M[13])/w, (M[2]*x+M[6]*y+M[10]*z+M[14])/w]; };
  window.__eye = () => {
    const I = inv(m.transform.modelViewProjectionMatrix); if (!I) return null;
    const A = xf(I,[0,0,-0.9]), B = xf(I,[0,0,0.9]), C = xf(I,[0.6,0.4,-0.9]), E = xf(I,[0.6,0.4,0.9]);
    const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]], v=[E[0]-C[0],E[1]-C[1],E[2]-C[2]], w0=[A[0]-C[0],A[1]-C[1],A[2]-C[2]];
    const dot=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2];
    const a=dot(u,u), b=dot(u,v), c=dot(v,v), d2=dot(u,w0), e=dot(v,w0), den=a*c-b*b;
    const s = den ? (b*e-c*d2)/den : 0;
    const p = [A[0]+s*u[0], A[1]+s*u[1], A[2]+s*u[2]];
    // the vertical-perspective matrix works in EARTH RADII, the mercator one in [worldPx, worldPx, m]
    if (Math.max(Math.abs(p[0]),Math.abs(p[1]),Math.abs(p[2])) < 64) { const r = Math.hypot(p[0],p[1],p[2]);
      return { space:'sphere', lng: Math.atan2(p[0],p[2])/D, lat: Math.asin(Math.max(-1,Math.min(1,p[1]/r)))/D, alt: (r-1)*R }; }
    const ws = m.transform.worldSize, x = p[0]/ws, y = p[1]/ws;
    return { space:'merc', lng: ((((x*360-180)+180)%360+360)%360)-180,
             lat: 360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90, alt: p[2] };
  };
  /* metres between two viewpoints — great-circle on the ground plus the altitude difference, so the
     two camera spaces are comparable and the number means something physical either side of z12 */
  window.__gap = (a, b) => { if (!a || !b) return NaN;
    const f1=a.lat*D, f2=b.lat*D;
    const h = Math.sin((f2-f1)/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin((b.lng-a.lng)*D/2)**2;
    return Math.hypot(2*R*Math.asin(Math.min(1,Math.sqrt(h))), b.alt-a.alt); };
};
