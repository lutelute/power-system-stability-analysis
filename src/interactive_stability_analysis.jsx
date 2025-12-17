const { useState, useCallback, useMemo } = React;

const InteractiveStabilityAnalysis = () => {
  // ===== システムパラメータ =====
  const [params, setParams] = useState({
    Xd: 1.8,
    Xd_prime: 0.3,
    XL: 5.0,
    Td0_prime: 5.0,
    Tq0_prime: 1.0,
  });

  // ===== 系統構成要素（物理量）=====
  const [systemConfig, setSystemConfig] = useState({
    // 有効電力負荷 [p.u.]
    P_load1: 0.05,  // 負荷1（工場など）
    P_load2: 0.03,  // 負荷2（住宅など）
    P_load3: 0.02,  // 負荷3（その他）
    // 無効電力源 [p.u.]
    Qc_cap1: 0.04,  // 電力用コンデンサ1
    Qc_cap2: 0.02,  // 電力用コンデンサ2
    Qc_cable: 0.015, // ケーブル充電容量
    // 電圧（基準）
    V: 1.0,
  });

  // ===== 負荷/コンデンサの接続状態 =====
  const [connected, setConnected] = useState({
    load1: true,
    load2: true,
    load3: true,
    cap1: true,
    cap2: true,
    cable: true,
  });

  // ===== 制御パラメータ =====
  const [controlMode, setControlMode] = useState('P_Q');
  const [targetK, setTargetK] = useState(1.0);
  const [timeData, setTimeData] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // ===== G, Bcの計算（縮約）=====
  const { G, Bc, P_total, Qc_total } = useMemo(() => {
    const V2 = systemConfig.V * systemConfig.V;
    
    // 接続されている負荷の合計
    let P = 0;
    if (connected.load1) P += systemConfig.P_load1;
    if (connected.load2) P += systemConfig.P_load2;
    if (connected.load3) P += systemConfig.P_load3;
    
    // 接続されているコンデンサの合計
    let Qc = 0;
    if (connected.cap1) Qc += systemConfig.Qc_cap1;
    if (connected.cap2) Qc += systemConfig.Qc_cap2;
    if (connected.cable) Qc += systemConfig.Qc_cable;
    
    return {
      G: P / V2,
      Bc: Qc / V2,
      P_total: P,
      Qc_total: Qc,
    };
  }, [systemConfig, connected]);

  // ===== 安定境界円 =====
  const stabilityCircle = useMemo(() => {
    const { Xd, Xd_prime, XL } = params;
    const Bc_center = 0.5 * (1 / (XL + Xd_prime) + 1 / (XL + Xd));
    const R = (Xd - Xd_prime) / (2 * (XL + Xd_prime) * (XL + Xd));
    return { G_center: 0, Bc_center, R };
  }, [params]);

  // ===== k等高線 =====
  const calculateKCircle = useCallback((k) => {
    const { Xd_prime, XL } = params;
    const X_total = XL + Xd_prime;
    return { G_center: 0, Bc_center: 1 / X_total, R: 1 / (k * X_total) };
  }, [params]);

  // ===== 各種計算関数 =====
  const checkStability = useCallback((g, bc) => {
    const { G_center, Bc_center, R } = stabilityCircle;
    return Math.sqrt(g * g + (bc - Bc_center) ** 2) > R;
  }, [stabilityCircle]);

  const calculateK = useCallback((g, bc) => {
    const X = params.XL + params.Xd_prime;
    const denom = Math.sqrt((1 - bc * X) ** 2 + (g * X) ** 2);
    return denom < 1e-10 ? 999 : 1 / denom;
  }, [params]);

  const calculateEigenvalues = useCallback((g, bc) => {
    const { Xd, Xd_prime, XL, Td0_prime, Tq0_prime } = params;
    const Q = Xd - Xd_prime;
    const X = XL + Xd_prime;
    const denom = (1 - bc * X) ** 2 + (g * X) ** 2;
    if (denom < 1e-10) return { real: 0, imag: 0, stable: false };
    
    const Yr = g / denom;
    const Yi = (bc - (g * g + bc * bc) * X) / denom;
    const a = Td0_prime * Tq0_prime;
    const b = -(Td0_prime + Tq0_prime) * (Yi * Q - 1);
    const c = (Yi * Q - 1) ** 2 + Yr ** 2 * Q * Q;
    const disc = b * b - 4 * a * c;
    
    if (disc >= 0) {
      const s1 = (-b + Math.sqrt(disc)) / (2 * a);
      const s2 = (-b - Math.sqrt(disc)) / (2 * a);
      return { real: Math.max(s1, s2), imag: 0, stable: s1 < 0 && s2 < 0, oscillatory: false };
    } else {
      const re = -b / (2 * a);
      const im = Math.sqrt(-disc) / (2 * a);
      return { real: re, imag: im, stable: re < 0, oscillatory: true };
    }
  }, [params]);

  // ===== 現在の状態 =====
  const isStable = checkStability(G, Bc);
  const kValue = calculateK(G, Bc);
  const eigenvalues = calculateEigenvalues(G, Bc);

  // ===== 時間応答シミュレーション =====
  const runSimulation = useCallback(() => {
    const dt = 0.02;
    const tMax = 8;
    const data = [];
    
    for (let t = 0; t <= tMax; t += dt) {
      const eig = calculateEigenvalues(G, Bc);
      const k = calculateK(G, Bc);
      const stable = checkStability(G, Bc);
      
      let VL = 1.0;
      if (t > 0.5) {
        const tau = t - 0.5;
        if (stable) {
          const decay = Math.exp(eig.real * tau);
          const osc = eig.oscillatory ? Math.cos(eig.imag * tau) : 1;
          VL = k * (1 + 0.2 * decay * osc);
        } else {
          const growth = Math.min(Math.exp(Math.abs(eig.real) * tau * 0.5), 4);
          VL = k * growth;
        }
      }
      
      data.push({ t, VL: Math.min(Math.max(VL, 0.4), 2.5), stable });
    }
    setTimeData(data);
  }, [G, Bc, calculateEigenvalues, calculateK, checkStability]);

  // ===== SVG設定 =====
  const svgW = 420, svgH = 350;
  const margin = { top: 25, right: 25, bottom: 45, left: 55 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;
  const GRange = { min: -0.01, max: 0.2 };
  const BcRange = { min: 0.05, max: 0.3 };

  const toX = (g) => margin.left + (g - GRange.min) / (GRange.max - GRange.min) * plotW;
  const toY = (bc) => margin.top + plotH - (bc - BcRange.min) / (BcRange.max - BcRange.min) * plotH;
  const fromX = (x) => GRange.min + (x - margin.left) / plotW * (GRange.max - GRange.min);
  const fromY = (y) => BcRange.max - (y - margin.top) / plotH * (BcRange.max - BcRange.min);

  // k等高線
  const kValues = [0.8, 0.9, 1.0, 1.1, 1.2, 1.5];
  const kColors = { 0.8: '#3b82f6', 0.9: '#22c55e', 1.0: '#eab308', 1.1: '#f97316', 1.2: '#ef4444', 1.5: '#991b1b' };

  // 時間グラフ設定
  const tgW = 380, tgH = 140;
  const tgM = { top: 20, right: 40, bottom: 25, left: 45 };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-2">
      <h1 className="text-lg font-bold text-center text-amber-400 mb-1">
        G-Bc平面 インタラクティブ解析
      </h1>
      <p className="text-center text-slate-400 text-xs mb-2">
        系統構成要素を操作してG, Bcの変化と安定性への影響を理解する
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        
        {/* 左：系統構成と操作 */}
        <div className="bg-slate-800 rounded-lg p-3 w-80">
          
          {/* 系統図（簡易） */}
          <div className="bg-slate-900 rounded p-2 mb-3">
            <h3 className="text-xs font-semibold text-amber-400 mb-2 text-center">系統縮約モデル</h3>
            <svg width="260" height="80" className="mx-auto">
              {/* 発電機 */}
              <circle cx="30" cy="40" r="18" fill="none" stroke="#22c55e" strokeWidth="2"/>
              <text x="30" y="44" fill="#22c55e" fontSize="10" textAnchor="middle">G</text>
              <line x1="48" y1="40" x2="70" y2="40" stroke="#94a3b8" strokeWidth="2"/>
              
              {/* 分路リアクトル */}
              <path d="M70,40 Q80,30 90,40 Q100,50 110,40 Q120,30 130,40" fill="none" stroke="#a855f7" strokeWidth="2"/>
              <text x="100" y="25" fill="#a855f7" fontSize="9" textAnchor="middle">jXL</text>
              <line x1="130" y1="40" x2="150" y2="40" stroke="#94a3b8" strokeWidth="2"/>
              
              {/* 母線 */}
              <line x1="150" y1="20" x2="150" y2="60" stroke="#eab308" strokeWidth="3"/>
              <text x="150" y="12" fill="#eab308" fontSize="9" textAnchor="middle">負荷母線</text>
              
              {/* G（負荷） */}
              <line x1="170" y1="30" x2="200" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
              <rect x="200" y="22" width="30" height="16" fill="none" stroke="#f97316" strokeWidth="2"/>
              <text x="215" y="32" fill="#f97316" fontSize="8" textAnchor="middle">G</text>
              <line x1="230" y1="30" x2="245" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
              <line x1="245" y1="25" x2="245" y2="35" stroke="#94a3b8" strokeWidth="2"/>
              
              {/* Bc（コンデンサ） */}
              <line x1="170" y1="55" x2="200" y2="55" stroke="#94a3b8" strokeWidth="1.5"/>
              <line x1="200" y1="48" x2="200" y2="62" stroke="#3b82f6" strokeWidth="2"/>
              <line x1="208" y1="48" x2="208" y2="62" stroke="#3b82f6" strokeWidth="2"/>
              <text x="220" y="58" fill="#3b82f6" fontSize="8">jBc</text>
              <line x1="208" y1="55" x2="245" y2="55" stroke="#94a3b8" strokeWidth="1.5"/>
              <line x1="245" y1="50" x2="245" y2="60" stroke="#94a3b8" strokeWidth="2"/>
              
              {/* 接続線 */}
              <line x1="150" y1="30" x2="170" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
              <line x1="150" y1="55" x2="170" y2="55" stroke="#94a3b8" strokeWidth="1.5"/>
            </svg>
          </div>

          {/* G の意味と調整 */}
          <div className="mb-3 p-2 bg-orange-900/30 rounded border border-orange-600">
            <h3 className="text-xs font-bold text-orange-400 mb-1">
              G = P/V² （コンダクタンス）
            </h3>
            <p className="text-[10px] text-slate-300 mb-2">
              有効電力負荷をアドミタンス換算。Gが大きい＝負荷が重い
            </p>
            
            {/* 負荷スイッチ */}
            <div className="space-y-1">
              {[
                { key: 'load1', label: '負荷1（工場）', value: systemConfig.P_load1 },
                { key: 'load2', label: '負荷2（住宅）', value: systemConfig.P_load2 },
                { key: 'load3', label: '負荷3（その他）', value: systemConfig.P_load3 },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1">
                    <input 
                      type="checkbox" 
                      checked={connected[item.key]}
                      onChange={(e) => setConnected({...connected, [item.key]: e.target.checked})}
                      className="w-3 h-3"
                    />
                    <span className={connected[item.key] ? 'text-orange-300' : 'text-slate-500 line-through'}>
                      {item.label}
                    </span>
                  </label>
                  <input 
                    type="number" 
                    value={item.value} 
                    step="0.01" 
                    min="0" 
                    max="0.1"
                    onChange={(e) => setSystemConfig({...systemConfig, [item.key.replace('load', 'P_load')]: parseFloat(e.target.value) || 0})}
                    className="w-16 bg-slate-800 rounded px-1 text-right text-[10px]"
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-2 pt-1 border-t border-orange-600/50 text-xs">
              <span className="text-slate-400">合計 P = </span>
              <span className="text-orange-400 font-bold">{P_total.toFixed(4)}</span>
              <span className="text-slate-400"> p.u. → </span>
              <span className="text-orange-400 font-bold">G = {G.toFixed(4)}</span>
            </div>
          </div>

          {/* Bc の意味と調整 */}
          <div className="mb-3 p-2 bg-blue-900/30 rounded border border-blue-600">
            <h3 className="text-xs font-bold text-blue-400 mb-1">
              Bc = Qc/V² （容量性サセプタンス）
            </h3>
            <p className="text-[10px] text-slate-300 mb-2">
              電力用コンデンサ等の進み無効電力。Bcが大きい＝容量性負荷が大きい
            </p>
            
            {/* コンデンサスイッチ */}
            <div className="space-y-1">
              {[
                { key: 'cap1', label: 'コンデンサ1', value: systemConfig.Qc_cap1, configKey: 'Qc_cap1' },
                { key: 'cap2', label: 'コンデンサ2', value: systemConfig.Qc_cap2, configKey: 'Qc_cap2' },
                { key: 'cable', label: 'ケーブル充電', value: systemConfig.Qc_cable, configKey: 'Qc_cable' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1">
                    <input 
                      type="checkbox" 
                      checked={connected[item.key]}
                      onChange={(e) => setConnected({...connected, [item.key]: e.target.checked})}
                      className="w-3 h-3"
                    />
                    <span className={connected[item.key] ? 'text-blue-300' : 'text-slate-500 line-through'}>
                      {item.label}
                    </span>
                  </label>
                  <input 
                    type="number" 
                    value={item.value} 
                    step="0.005" 
                    min="0" 
                    max="0.1"
                    onChange={(e) => setSystemConfig({...systemConfig, [item.configKey]: parseFloat(e.target.value) || 0})}
                    className="w-16 bg-slate-800 rounded px-1 text-right text-[10px]"
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-2 pt-1 border-t border-blue-600/50 text-xs">
              <span className="text-slate-400">合計 Qc = </span>
              <span className="text-blue-400 font-bold">{Qc_total.toFixed(4)}</span>
              <span className="text-slate-400"> p.u. → </span>
              <span className="text-blue-400 font-bold">Bc = {Bc.toFixed(4)}</span>
            </div>
          </div>

          {/* クイック操作ボタン */}
          <div className="grid grid-cols-2 gap-1 mb-2">
            <button 
              onClick={() => setConnected({...connected, load3: !connected.load3})}
              className="text-[10px] py-1 px-2 bg-orange-700 hover:bg-orange-600 rounded"
            >
              負荷3 {connected.load3 ? '遮断' : '投入'}
            </button>
            <button 
              onClick={() => setConnected({...connected, cap1: !connected.cap1})}
              className="text-[10px] py-1 px-2 bg-blue-700 hover:bg-blue-600 rounded"
            >
              コンデンサ1 {connected.cap1 ? '切離' : '投入'}
            </button>
            <button 
              onClick={() => {
                setConnected({...connected, load2: false, load3: false});
              }}
              className="text-[10px] py-1 px-2 bg-red-700 hover:bg-red-600 rounded"
            >
              負荷遮断（不安定化）
            </button>
            <button 
              onClick={() => {
                setConnected({...connected, cap1: false, cap2: false});
              }}
              className="text-[10px] py-1 px-2 bg-green-700 hover:bg-green-600 rounded"
            >
              コンデンサ切離（安定化）
            </button>
          </div>

          {/* リセット */}
          <button 
            onClick={() => setConnected({load1: true, load2: true, load3: true, cap1: true, cap2: true, cable: true})}
            className="w-full text-xs py-1 bg-slate-600 hover:bg-slate-500 rounded"
          >
            全て接続（リセット）
          </button>
        </div>

        {/* 中央：G-Bc平面 */}
        <div className="bg-slate-800 rounded-lg p-2">
          <h2 className="text-sm font-semibold mb-1 text-center">G-Bc 平面</h2>
          <svg width={svgW} height={svgH}>
            <rect x={margin.left} y={margin.top} width={plotW} height={plotH} fill="#0f172a" />
            
            {/* グリッド */}
            {[0, 0.05, 0.1, 0.15].map(g => (
              <line key={`vg${g}`} x1={toX(g)} y1={margin.top} x2={toX(g)} y2={svgH - margin.bottom} 
                stroke="#334155" strokeWidth={g === 0 ? 1 : 0.5} />
            ))}
            {[0.1, 0.15, 0.2, 0.25].map(bc => (
              <line key={`hb${bc}`} x1={margin.left} y1={toY(bc)} x2={svgW - margin.right} y2={toY(bc)} 
                stroke="#334155" strokeWidth={0.5} />
            ))}

            {/* k等高線 */}
            {kValues.map((k) => {
              const c = calculateKCircle(k);
              const pts = [];
              for (let th = -Math.PI; th <= Math.PI; th += 0.02) {
                const g = c.G_center + c.R * Math.cos(th);
                const bc = c.Bc_center + c.R * Math.sin(th);
                if (g >= GRange.min && g <= GRange.max && bc >= BcRange.min && bc <= BcRange.max) {
                  pts.push(`${toX(g)},${toY(bc)}`);
                }
              }
              if (pts.length < 2) return null;
              return (
                <polyline key={`k${k}`} points={pts.join(' ')} fill="none" 
                  stroke={kColors[k]} strokeWidth={k === 1.0 ? 2 : 1} 
                  strokeDasharray={k === 1.0 ? "none" : "4,2"} opacity={0.6} />
              );
            })}
            
            {/* kラベル */}
            <text x={toX(0.12)} y={toY(0.13)} fill="#eab308" fontSize="9" fontWeight="bold">k=1.0</text>
            <text x={toX(0.08)} y={toY(0.14)} fill="#f97316" fontSize="8">k=1.1</text>
            <text x={toX(0.05)} y={toY(0.15)} fill="#ef4444" fontSize="8">k=1.2</text>

            {/* 安定境界円 */}
            <circle 
              cx={toX(stabilityCircle.G_center)} 
              cy={toY(stabilityCircle.Bc_center)} 
              r={stabilityCircle.R / (GRange.max - GRange.min) * plotW}
              fill="rgba(239, 68, 68, 0.15)"
              stroke="#ef4444"
              strokeWidth={3}
            />
            
            {/* 領域ラベル */}
            <text x={toX(0.015)} y={toY(0.185)} fill="#ef4444" fontSize="10" fontWeight="bold">不安定</text>
            <text x={toX(0.015)} y={toY(0.185) + 11} fill="#ef4444" fontSize="8">(自己励磁)</text>
            <text x={toX(0.13)} y={toY(0.22)} fill="#22c55e" fontSize="10" fontWeight="bold">安定</text>

            {/* 運転点 */}
            <circle cx={toX(G)} cy={toY(Bc)} r={14}
              fill={isStable ? "#22c55e" : "#ef4444"} stroke="white" strokeWidth={3} />
            <text x={toX(G)} y={toY(Bc) + 4} fill="white" fontSize="11" fontWeight="bold" 
              textAnchor="middle" pointerEvents="none">OP</text>

            {/* 軸ラベル */}
            <text x={svgW / 2} y={svgH - 8} fill="white" fontSize="10" textAnchor="middle">
              G [p.u.] ← 負荷遮断で減少
            </text>
            <text x={12} y={svgH / 2} fill="white" fontSize="10" textAnchor="middle" 
              transform={`rotate(-90, 12, ${svgH / 2})`}>
              Bc [p.u.] ← コンデンサ切離で減少
            </text>
            
            {/* 目盛り */}
            {[0, 0.05, 0.1, 0.15].map(g => (
              <text key={`tG${g}`} x={toX(g)} y={svgH - margin.bottom + 12} fill="#94a3b8" fontSize="8" textAnchor="middle">
                {g.toFixed(2)}
              </text>
            ))}
            {[0.1, 0.15, 0.2, 0.25].map(bc => (
              <text key={`tBc${bc}`} x={margin.left - 5} y={toY(bc) + 3} fill="#94a3b8" fontSize="8" textAnchor="end">
                {bc.toFixed(2)}
              </text>
            ))}
          </svg>

          {/* 状態表示 */}
          <div className={`mt-2 p-2 rounded text-center ${isStable ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
            <div className="text-sm font-bold">
              {isStable ? '✓ 安定領域' : '✗ 不安定領域（自己励磁）'}
            </div>
            <div className="text-xs mt-1 space-x-3">
              <span>G = <span className="text-orange-400 font-mono">{G.toFixed(4)}</span></span>
              <span>Bc = <span className="text-blue-400 font-mono">{Bc.toFixed(4)}</span></span>
              <span>k = <span className={`font-mono ${kValue > 1.05 ? 'text-red-400' : kValue < 0.95 ? 'text-blue-400' : 'text-green-400'}`}>
                {kValue.toFixed(3)}
              </span></span>
            </div>
          </div>
        </div>

        {/* 右：解説と結果 */}
        <div className="bg-slate-800 rounded-lg p-3 w-72">
          <h2 className="text-sm font-semibold mb-2 text-amber-400">物理的解釈</h2>
          
          <div className="space-y-2 text-xs">
            {/* 安定性の条件 */}
            <div className="p-2 bg-slate-700 rounded">
              <h3 className="font-bold text-slate-200 mb-1">不安定化のメカニズム</h3>
              <ol className="text-slate-300 space-y-0.5 list-decimal list-inside">
                <li>系統分離で周波数低下</li>
                <li>周波数維持のため<span className="text-orange-400">負荷遮断</span>（G↓）</li>
                <li>G減少で運転点が左移動</li>
                <li>不安定領域に入ると<span className="text-red-400">自己励磁</span></li>
              </ol>
            </div>
            
            {/* 安定化の対策 */}
            <div className="p-2 bg-slate-700 rounded">
              <h3 className="font-bold text-slate-200 mb-1">安定化対策</h3>
              <ul className="text-slate-300 space-y-0.5">
                <li>• <span className="text-blue-400">コンデンサ切離</span>（Bc↓）→ 下移動</li>
                <li>• <span className="text-purple-400">分路リアクトル投入</span>（Bc↓）</li>
                <li>• P+Q協調制御で安定領域維持</li>
              </ul>
            </div>
            
            {/* 電圧係数 */}
            <div className="p-2 bg-slate-700 rounded">
              <h3 className="font-bold text-slate-200 mb-1">電圧係数 k の意味</h3>
              <p className="text-slate-300">
                k = |VL|/|V| = 負荷端電圧/発電機内部電圧
              </p>
              <ul className="mt-1 text-slate-400">
                <li>• k {'>'} 1: <span className="text-red-400">過電圧</span></li>
                <li>• k = 1: 定格</li>
                <li>• k {'<'} 1: <span className="text-blue-400">低電圧</span></li>
              </ul>
            </div>

            {/* 固有値情報 */}
            <div className="p-2 bg-slate-700 rounded">
              <h3 className="font-bold text-slate-200 mb-1">固有値（安定性指標）</h3>
              <div className={`font-mono ${eigenvalues.stable ? 'text-green-400' : 'text-red-400'}`}>
                {eigenvalues.oscillatory ? (
                  <>{eigenvalues.real.toFixed(4)} ± j{eigenvalues.imag.toFixed(4)}</>
                ) : (
                  <>実根: {eigenvalues.real.toFixed(4)}</>
                )}
              </div>
              <p className="text-slate-400 text-[10px] mt-1">
                実部 {'<'} 0 で安定、{'>'} 0 で不安定（発散）
              </p>
            </div>
          </div>

          <button onClick={runSimulation}
            className="mt-3 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded text-sm font-medium">
            ▶ 時間応答シミュレーション
          </button>
        </div>
      </div>

      {/* 時間応答グラフ */}
      {timeData.length > 0 && (
        <div className="mt-3 flex justify-center">
          <div className="bg-slate-800 rounded-lg p-2">
            <h2 className="text-sm font-semibold mb-1 text-center">
              時間応答（t=0.5sで系統分離）
            </h2>
            <svg width={tgW} height={tgH}>
              <rect x={tgM.left} y={tgM.top} width={tgW - tgM.left - tgM.right} height={tgH - tgM.top - tgM.bottom} fill="#0f172a" />
              
              {/* 基準線 */}
              <line x1={tgM.left} y1={tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (1.0 - 0.4) / 2.1)} 
                x2={tgW - tgM.right} y2={tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (1.0 - 0.4) / 2.1)} 
                stroke="#475569" strokeDasharray="3,3" />
              <line x1={tgM.left} y1={tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (1.2 - 0.4) / 2.1)} 
                x2={tgW - tgM.right} y2={tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (1.2 - 0.4) / 2.1)} 
                stroke="#f97316" strokeDasharray="2,2" opacity={0.5} />
              
              {/* 分離時刻 */}
              <line x1={tgM.left + (tgW - tgM.left - tgM.right) * 0.5 / 8} y1={tgM.top} 
                x2={tgM.left + (tgW - tgM.left - tgM.right) * 0.5 / 8} y2={tgH - tgM.bottom} 
                stroke="#f97316" strokeDasharray="4,2" />
              <text x={tgM.left + (tgW - tgM.left - tgM.right) * 0.5 / 8} y={tgM.top - 5} 
                fill="#f97316" fontSize="9" textAnchor="middle">分離</text>
              
              {/* 電圧波形 */}
              <path
                d={timeData.map((d, i) => {
                  const x = tgM.left + (d.t / 8) * (tgW - tgM.left - tgM.right);
                  const y = tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (d.VL - 0.4) / 2.1);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).join(' ')}
                fill="none" stroke={isStable ? "#22c55e" : "#ef4444"} strokeWidth={2.5} />
              
              <text x={tgW / 2} y={tgH - 5} fill="#94a3b8" fontSize="9" textAnchor="middle">時間 [s]</text>
              <text x={8} y={tgH / 2} fill="#94a3b8" fontSize="9" textAnchor="middle" transform={`rotate(-90, 8, ${tgH / 2})`}>VL [p.u.]</text>
              
              {[0.6, 1.0, 1.4, 1.8, 2.2].map(v => (
                <text key={v} x={tgM.left - 5} y={tgM.top + (tgH - tgM.top - tgM.bottom) * (1 - (v - 0.4) / 2.1) + 3} 
                  fill="#94a3b8" fontSize="8" textAnchor="end">{v}</text>
              ))}
              {[0, 2, 4, 6, 8].map(t => (
                <text key={t} x={tgM.left + (t / 8) * (tgW - tgM.left - tgM.right)} y={tgH - tgM.bottom + 12} 
                  fill="#94a3b8" fontSize="8" textAnchor="middle">{t}</text>
              ))}
            </svg>
            
            <div className={`text-center text-xs mt-1 ${isStable ? 'text-green-400' : 'text-red-400'}`}>
              {isStable ? `安定収束（k=${kValue.toFixed(2)}の定常過電圧）` : '不安定発散（自己励磁現象）！'}
            </div>
          </div>
        </div>
      )}

      {/* 操作ガイド */}
      <div className="mt-3 max-w-3xl mx-auto bg-slate-800 rounded-lg p-2 text-xs text-slate-400">
        <span className="text-amber-400 font-semibold">操作ガイド:</span>
        <span className="ml-2">チェックボックスで負荷/コンデンサを接続・切離 → G, Bcが変化 → 運転点が移動 → 安定性が変化</span>
      </div>
    </div>
  );
};

// Reactアプリをマウント
ReactDOM.render(<InteractiveStabilityAnalysis />, document.getElementById('react-app'));