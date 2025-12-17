const { useState, useCallback, useMemo } = React;

const InteractiveStabilityAnalysis = () => {
  // システムパラメータ
  const [params, setParams] = useState({
    Xd: 1.8,
    Xd_prime: 0.3,
    XL: 5.0,
    Td0_prime: 5.0,
    Tq0_prime: 1.0,
  });

  // G, Bc値（直接操作可能）
  const [G, setG] = useState(0.1);
  const [Bc, setBc] = useState(0.15);

  // 安定境界円の計算
  const stabilityCircle = useMemo(() => {
    const { Xd, Xd_prime, XL } = params;
    const Bc_center = 0.5 * (1 / (XL + Xd_prime) + 1 / (XL + Xd));
    const R = (Xd - Xd_prime) / (2 * (XL + Xd_prime) * (XL + Xd));
    return { G_center: 0, Bc_center, R };
  }, [params]);

  // k等高線計算
  const calculateKCircle = useCallback((k) => {
    const { Xd_prime, XL } = params;
    const X_total = XL + Xd_prime;
    return { G_center: 0, Bc_center: 1 / X_total, R: 1 / (k * X_total) };
  }, [params]);

  // 安定性チェック
  const checkStability = useCallback((g, bc) => {
    const { G_center, Bc_center, R } = stabilityCircle;
    const distance = Math.sqrt((g - G_center) ** 2 + (bc - Bc_center) ** 2);
    return distance > R;
  }, [stabilityCircle]);

  // k値計算
  const calculateK = useCallback((g, bc) => {
    const X = params.XL + params.Xd_prime;
    const denom = Math.sqrt((1 - bc * X) ** 2 + (g * X) ** 2);
    return denom < 1e-10 ? 999 : 1 / denom;
  }, [params]);

  // 現在の状態
  const isStable = checkStability(G, Bc);
  const kValue = calculateK(G, Bc);

  // SVG設定
  const svgW = 500, svgH = 400;
  const margin = { top: 30, right: 30, bottom: 60, left: 80 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;
  const GRange = { min: -0.02, max: 0.25 };
  const BcRange = { min: 0.05, max: 0.35 };

  const toX = (g) => margin.left + (g - GRange.min) / (GRange.max - GRange.min) * plotW;
  const toY = (bc) => margin.top + plotH - (bc - BcRange.min) / (BcRange.max - BcRange.min) * plotH;

  // k等高線の値
  const kValues = [0.8, 0.9, 1.0, 1.1, 1.2, 1.5];
  const kColors = { 0.8: '#3b82f6', 0.9: '#22c55e', 1.0: '#eab308', 1.1: '#f97316', 1.2: '#ef4444', 1.5: '#991b1b' };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>
        電力系統安定性解析：G-Bc平面
      </h1>
      
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
        {/* 制御パネル */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#34495e', marginBottom: '15px' }}>パラメータ制御</h2>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              G (コンダクタンス): {G.toFixed(4)} p.u.
            </label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.005"
              value={G}
              onChange={(e) => setG(parseFloat(e.target.value))}
              style={{ width: '200px' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Bc (容量性サセプタンス): {Bc.toFixed(4)} p.u.
            </label>
            <input
              type="range"
              min="0.06"
              max="0.3"
              step="0.005"
              value={Bc}
              onChange={(e) => setBc(parseFloat(e.target.value))}
              style={{ width: '200px' }}
            />
          </div>

          <div style={{ backgroundColor: isStable ? '#d4edda' : '#f8d7da', padding: '10px', borderRadius: '5px', marginTop: '20px' }}>
            <strong>状態: {isStable ? '安定' : '不安定（自己励磁）'}</strong><br/>
            電圧係数 k = {kValue.toFixed(3)}
          </div>

          <div style={{ marginTop: '15px' }}>
            <button 
              onClick={() => { setG(0.05); setBc(0.2); }}
              style={{ padding: '8px 16px', marginRight: '8px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              安定点設定
            </button>
            <button 
              onClick={() => { setG(0.02); setBc(0.18); }}
              style={{ padding: '8px 16px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              不安定点設定
            </button>
          </div>
        </div>

        {/* G-Bc平面グラフ */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ textAlign: 'center', color: '#34495e', marginBottom: '15px' }}>G-Bc 平面</h2>
          
          <svg width={svgW} height={svgH}>
            {/* 背景 */}
            <rect x={margin.left} y={margin.top} width={plotW} height={plotH} fill="#f8f9fa" stroke="#dee2e6" />
            
            {/* グリッド */}
            {[0, 0.05, 0.1, 0.15, 0.2].map(g => (
              <line key={`vg${g}`} x1={toX(g)} y1={margin.top} x2={toX(g)} y2={svgH - margin.bottom} 
                stroke="#e9ecef" strokeWidth="1" />
            ))}
            {[0.1, 0.15, 0.2, 0.25, 0.3].map(bc => (
              <line key={`hb${bc}`} x1={margin.left} y1={toY(bc)} x2={svgW - margin.right} y2={toY(bc)} 
                stroke="#e9ecef" strokeWidth="1" />
            ))}

            {/* k等高線 */}
            {kValues.map((k) => {
              const c = calculateKCircle(k);
              const points = [];
              for (let th = -Math.PI; th <= Math.PI; th += 0.02) {
                const g = c.G_center + c.R * Math.cos(th);
                const bc = c.Bc_center + c.R * Math.sin(th);
                if (g >= GRange.min && g <= GRange.max && bc >= BcRange.min && bc <= BcRange.max) {
                  points.push(`${toX(g)},${toY(bc)}`);
                }
              }
              if (points.length < 2) return null;
              return (
                <polyline key={`k${k}`} points={points.join(' ')} fill="none" 
                  stroke={kColors[k]} strokeWidth={k === 1.0 ? 3 : 2} 
                  strokeDasharray={k === 1.0 ? "none" : "5,3"} />
              );
            })}

            {/* 安定境界円 */}
            <circle 
              cx={toX(stabilityCircle.G_center)} 
              cy={toY(stabilityCircle.Bc_center)} 
              r={stabilityCircle.R / (GRange.max - GRange.min) * plotW}
              fill="rgba(220, 53, 69, 0.2)"
              stroke="#dc3545"
              strokeWidth={3}
            />

            {/* 運転点 */}
            <circle cx={toX(G)} cy={toY(Bc)} r={8}
              fill={isStable ? "#28a745" : "#dc3545"} stroke="white" strokeWidth={3} />

            {/* 軸ラベル */}
            <text x={svgW / 2} y={svgH - 15} fill="#495057" fontSize="14" textAnchor="middle">
              G [p.u.]
            </text>
            <text x={20} y={svgH / 2} fill="#495057" fontSize="14" textAnchor="middle" 
              transform={`rotate(-90, 20, ${svgH / 2})`}>
              Bc [p.u.]
            </text>
            
            {/* 目盛り */}
            {[0, 0.05, 0.1, 0.15, 0.2].map(g => (
              <text key={`tG${g}`} x={toX(g)} y={svgH - margin.bottom + 15} fill="#6c757d" fontSize="12" textAnchor="middle">
                {g.toFixed(2)}
              </text>
            ))}
            {[0.1, 0.15, 0.2, 0.25, 0.3].map(bc => (
              <text key={`tBc${bc}`} x={margin.left - 10} y={toY(bc) + 4} fill="#6c757d" fontSize="12" textAnchor="end">
                {bc.toFixed(2)}
              </text>
            ))}

            {/* ラベル */}
            <text x={toX(0.15)} y={toY(0.25)} fill="#28a745" fontSize="14" fontWeight="bold">安定領域</text>
            <text x={toX(0.03)} y={toY(0.18)} fill="#dc3545" fontSize="14" fontWeight="bold">不安定領域</text>
            <text x={toX(0.12)} y={toY(0.15)} fill="#ffc107" fontSize="12" fontWeight="bold">k=1.0</text>
          </svg>
        </div>
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center', color: '#6c757d' }}>
        <p>スライダーを動かしてG, Bcの値を変更し、運転点の移動と安定性の変化を確認してください。</p>
      </div>
    </div>
  );
};

// Reactアプリをマウント
ReactDOM.render(React.createElement(InteractiveStabilityAnalysis), document.getElementById('react-app'));