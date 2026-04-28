import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap, Legend, LabelList,
} from 'recharts';
import budgetData from './data/budget-data.json';
import {
  CF_LABELS, CE_LABELS, SURSA_LABELS, SURSA_COLORS,
  CE_COLORS, CF_COLORS, INSTITUTION_CATEGORIES,
} from './data/classifications';

// ── Helpers ──────────────────────────────────────────────────
const fmtLei = (v) => {
  if (v == null || isNaN(v)) return '–';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + ' mld';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + ' mil';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + ' mii';
  return sign + abs.toLocaleString('ro-RO');
};

const fmtLeiLong = (v) => {
  if (v == null || isNaN(v)) return '–';
  return v.toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' lei';
};

const pct = (v, total) => total ? ((v / total) * 100).toFixed(1) + '%' : '–';

const TABS = [
  { id: 'overview', label: 'Prezentare' },
  { id: 'institutii', label: 'Instituții' },
  { id: 'functii', label: 'Pe funcții' },
  { id: 'economic', label: 'Pe tipuri' },
  { id: 'spitale', label: 'Spitale' },
  { id: 'surse', label: 'Surse' },
];

const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text)' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--c-text)', display: 'flex', gap: 8 }}>
          <span>{p.name}:</span>
          <strong>{formatter ? formatter(p.value) : fmtLei(p.value)} lei</strong>
        </div>
      ))}
    </div>
  );
};

const MetricCard = ({ label, value, sub, color }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 20px', borderTop: `3px solid ${color || '#185FA5'}` }}>
    <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text)' }} className="tabular-nums">{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Badge = ({ label, color }) => (
  <span style={{ display: 'inline-block', background: color + '18', color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>{label}</span>
);

// ── Main Component ───────────────────────────────────────────
export default function BudgetDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('pmb-theme') || 'light');

  // Tab-specific state
  const [instView, setInstView] = useState('bar');
  const [instSort, setInstSort] = useState('desc');
  const [instCategory, setInstCategory] = useState('all');
  const [instSearch, setInstSearch] = useState('');
  const [selectedInst, setSelectedInst] = useState(null);

  const [hospSort, setHospSort] = useState('desc');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('pmb-theme', next);
  };

  // ── Derived data ─────────────────────────────────────────
  const { institutions, hospitals } = budgetData;

  // Exclude centralizator spitale from institution list to avoid double-counting
  const instFiltered = useMemo(() => {
    let list = institutions.filter(i => i.fileRef !== '2.44.1.1');
    if (instCategory !== 'all') list = list.filter(i => i.category === instCategory);
    if (instSearch) {
      const q = instSearch.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => instSort === 'desc' ? b.totalBuget - a.totalBuget : a.totalBuget - b.totalBuget);
    return list;
  }, [institutions, instCategory, instSearch, instSort]);

  const totalCheltuieli = useMemo(() =>
    institutions.filter(i => i.fileRef !== '2.44.1.1').reduce((s, i) => s + i.totalBuget, 0),
    [institutions]
  );

  const totalBuget = budgetData.meta.totalBugetGeneral || totalCheltuieli;

  const totalInvestitii = useMemo(() => {
    return institutions.filter(i => i.fileRef !== '2.44.1.1').reduce((s, inst) => {
      return s + inst.byCF.reduce((s2, cf) => {
        return s2 + cf.byCE.filter(ce => ce.ce === '71').reduce((s3, ce) => s3 + ce.total, 0);
      }, 0);
    }, 0);
  }, [institutions]);

  const totalPersonal = useMemo(() => {
    return institutions.filter(i => i.fileRef !== '2.44.1.1').reduce((s, inst) => {
      return s + inst.byCF.reduce((s2, cf) => {
        return s2 + cf.byCE.filter(ce => ce.ce === '10').reduce((s3, ce) => s3 + ce.total, 0);
      }, 0);
    }, 0);
  }, [institutions]);

  const totalHospitale = useMemo(() =>
    hospitals.reduce((s, h) => s + h.totalBuget, 0),
    [hospitals]
  );

  // Aggregate by CF across all institutions
  const aggregatedCF = useMemo(() => {
    const cfMap = {};
    for (const inst of institutions.filter(i => i.fileRef !== '2.44.1.1')) {
      for (const cf of inst.byCF) {
        if (!cfMap[cf.cf]) cfMap[cf.cf] = { cf: cf.cf, total: 0, institutions: [] };
        cfMap[cf.cf].total += cf.total;
        cfMap[cf.cf].institutions.push({ name: inst.name, total: cf.total });
      }
    }
    return Object.values(cfMap).sort((a, b) => b.total - a.total);
  }, [institutions]);

  // Aggregate by CE across all institutions
  const aggregatedCE = useMemo(() => {
    const ceMap = {};
    for (const inst of institutions.filter(i => i.fileRef !== '2.44.1.1')) {
      for (const cf of inst.byCF) {
        for (const ce of cf.byCE) {
          if (!ceMap[ce.ce]) ceMap[ce.ce] = { ce: ce.ce, total: 0, institutions: [] };
          ceMap[ce.ce].total += ce.total;
          const existing = ceMap[ce.ce].institutions.find(x => x.name === inst.name);
          if (existing) existing.total += ce.total;
          else ceMap[ce.ce].institutions.push({ name: inst.name, total: ce.total });
        }
      }
    }
    return Object.values(ceMap).sort((a, b) => b.total - a.total);
  }, [institutions]);

  // Aggregate by sursa
  const aggregatedSursa = useMemo(() => {
    const sMap = {};
    for (const inst of institutions.filter(i => i.fileRef !== '2.44.1.1')) {
      for (const [sursa, amount] of Object.entries(inst.bySursa)) {
        sMap[sursa] = (sMap[sursa] || 0) + amount;
      }
    }
    return Object.entries(sMap)
      .map(([sursa, total]) => ({ sursa, total, label: SURSA_LABELS[sursa] || sursa }))
      .sort((a, b) => b.total - a.total);
  }, [institutions]);

  const hospSorted = useMemo(() =>
    [...hospitals].sort((a, b) => hospSort === 'desc' ? b.totalBuget - a.totalBuget : a.totalBuget - b.totalBuget),
    [hospitals, hospSort]
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div data-theme={theme} style={{ minHeight: '100vh', background: 'var(--bg-surface)', color: 'var(--c-text)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bugetul Municipiului București 2026</h1>
              <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '4px 0 0' }}>
                Proiect de buget aflat în dezbatere publică &middot; <a href="https://www.pmb.ro/buget/arhiva/get-anual-buget-list/2026/113" target="_blank" rel="noopener" style={{ color: 'var(--c-muted)' }}>Sursă oficială PMB</a>
              </p>
            </div>
            <button onClick={toggleTheme} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--c-text)' }}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        {/* Tab bar */}
        <nav className="tab-scroll" style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 24, borderBottom: '1px solid var(--border-color)', paddingBottom: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedInst(null); }}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #185FA5' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--c-text)' : 'var(--c-muted)', whiteSpace: 'nowrap',
              }}
            >{tab.label}</button>
          ))}
        </nav>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <OverviewTab
            totalBuget={totalBuget} totalInvestitii={totalInvestitii} totalPersonal={totalPersonal}
            totalHospitale={totalHospitale} institutions={instFiltered} hospitals={hospitals}
            aggregatedCF={aggregatedCF} aggregatedSursa={aggregatedSursa}
          />
        )}
        {activeTab === 'institutii' && (
          <InstitutiiTab
            institutions={instFiltered} totalBuget={totalBuget}
            view={instView} setView={setInstView}
            sort={instSort} setSort={setInstSort}
            category={instCategory} setCategory={setInstCategory}
            search={instSearch} setSearch={setInstSearch}
            selectedInst={selectedInst} setSelectedInst={setSelectedInst}
          />
        )}
        {activeTab === 'functii' && <FunctiiTab data={aggregatedCF} total={totalBuget} />}
        {activeTab === 'economic' && <EconomicTab data={aggregatedCE} total={totalBuget} />}
        {activeTab === 'spitale' && (
          <SpitaleTab hospitals={hospSorted} total={totalHospitale} sort={hospSort} setSort={setHospSort} />
        )}
        {activeTab === 'surse' && <SurseTab data={aggregatedSursa} total={totalBuget} institutions={institutions.filter(i => i.fileRef !== '2.44.1.1')} />}

        {/* Footer */}
        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--c-muted)', textAlign: 'center' }}>
          Date din proiectul de buget PMB 2026 &middot; Dezbatere publică 30 aprilie 2026 &middot;{' '}
          <a href="https://www.pmb.ro/buget/arhiva/get-anual-buget-list/2026/113" target="_blank" rel="noopener" style={{ color: 'var(--c-muted)' }}>pmb.ro</a>
        </footer>
      </div>
    </div>
  );
}

// ── OVERVIEW TAB ─────────────────────────────────────────────
function OverviewTab({ totalBuget, totalInvestitii, totalPersonal, totalHospitale, institutions, hospitals, aggregatedCF, aggregatedSursa }) {
  const top10 = institutions.slice(0, 10);
  const cfPie = aggregatedCF.filter(c => c.total > 0).slice(0, 10);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Buget general" value={fmtLei(totalBuget) + ' lei'} sub="după scăderea transferurilor inter-bugete" color="#185FA5" />
        <MetricCard label="Spitale (venituri proprii CNAS)" value={fmtLei(totalHospitale) + ' lei'} sub={`${hospitals.length} spitale · nu din bugetul local`} color="#993556" />
        <MetricCard label="Investiții" value={fmtLei(totalInvestitii) + ' lei'} sub={pct(totalInvestitii, totalBuget) + ' din total'} color="#639922" />
        <MetricCard label="Cheltuieli personal" value={fmtLei(totalPersonal) + ' lei'} sub={pct(totalPersonal, totalBuget) + ' din total'} color="#D85A30" />
      </div>

      {/* Top 10 institutions */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Top 10 instituții după buget</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={top10} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
            <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11, fill: 'var(--c-text)' }}
              tickFormatter={n => n.length > 35 ? n.slice(0, 32) + '…' : n} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="totalBuget" name="Buget" radius={[0, 4, 4, 0]}>
              {top10.map((inst, i) => (
                <Cell key={i} fill={INSTITUTION_CATEGORIES[inst.category]?.color || '#666'} />
              ))}
              <LabelList dataKey="totalBuget" position="right" formatter={fmtLei} style={{ fontSize: 11, fill: 'var(--c-text)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CF & Surse side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Pe funcții (clasificare funcțională)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={cfPie} dataKey="total" nameKey="cf" cx="50%" cy="50%" innerRadius={50} outerRadius={100}
                label={({ cf, percent }) => `${CF_LABELS[cf]?.slice(0, 15) || cf} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--c-muted)' }} style={{ fontSize: 10 }}>
                {cfPie.map((c, i) => <Cell key={i} fill={CF_COLORS[c.cf] || '#999'} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtLei(v) + ' lei'} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Surse de finanțare</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={aggregatedSursa.filter(s => s.total > 0)} dataKey="total" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={100}
                label={({ label, percent }) => `${label?.slice(0, 15)} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--c-muted)' }} style={{ fontSize: 10 }}>
                {aggregatedSursa.filter(s => s.total > 0).map((s, i) => <Cell key={i} fill={SURSA_COLORS[s.sursa] || '#999'} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtLei(v) + ' lei'} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── INSTITUTIONS TAB ────────────────────────────────────────
function InstitutiiTab({ institutions, totalBuget, view, setView, sort, setSort, category, setCategory, search, setSearch, selectedInst, setSelectedInst }) {
  if (selectedInst) {
    const inst = institutions.find(i => i.fileRef === selectedInst);
    if (!inst) { setSelectedInst(null); return null; }
    return <InstitutionDetail inst={inst} onBack={() => setSelectedInst(null)} />;
  }

  const treemapData = institutions.filter(i => i.totalBuget > 0).map(i => ({
    name: i.name.length > 30 ? i.name.slice(0, 27) + '…' : i.name,
    fullName: i.name,
    size: i.totalBuget,
    fill: INSTITUTION_CATEGORIES[i.category]?.color || '#666',
    fileRef: i.fileRef,
  }));

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text" placeholder="Caută instituție..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--c-text)', fontSize: 13, flex: '1 1 200px' }}
        />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--c-text)', fontSize: 13 }}>
          <option value="all">Toate categoriile</option>
          {Object.entries(INSTITUTION_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 2 }}>
          {['bar', 'treemap', 'table'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12, background: view === v ? '#185FA5' : 'transparent', color: view === v ? '#fff' : 'var(--c-muted)' }}>
              {v === 'bar' ? 'Grafic' : v === 'treemap' ? 'Treemap' : 'Tabel'}
            </button>
          ))}
        </div>
        <button onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
          style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: 12 }}>
          {sort === 'desc' ? '↓ Descrescător' : '↑ Crescător'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 12 }}>
        {institutions.length} instituții &middot; Total: {fmtLei(institutions.reduce((s, i) => s + i.totalBuget, 0))} lei
      </div>

      {/* Bar view */}
      {view === 'bar' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <ResponsiveContainer width="100%" height={Math.max(400, institutions.length * 28)}>
            <BarChart data={institutions} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
              <YAxis type="category" dataKey="name" width={240} tick={{ fontSize: 10, fill: 'var(--c-text)' }}
                tickFormatter={n => n.length > 40 ? n.slice(0, 37) + '…' : n} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="totalBuget" name="Buget" radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(data) => setSelectedInst(data.fileRef)}>
                {institutions.map((inst, i) => (
                  <Cell key={i} fill={INSTITUTION_CATEGORIES[inst.category]?.color || '#666'} />
                ))}
                <LabelList dataKey="totalBuget" position="right" formatter={fmtLei} style={{ fontSize: 10, fill: 'var(--c-text)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Treemap view */}
      {view === 'treemap' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <ResponsiveContainer width="100%" height={500}>
            <Treemap data={treemapData} dataKey="size" nameKey="name" aspectRatio={4 / 3}
              content={({ x, y, width, height, name, fill }) => {
                if (width < 40 || height < 20) return <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--bg-surface)" strokeWidth={2} />;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--bg-surface)" strokeWidth={2} rx={4} />
                    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
                      fill="#fff" fontSize={width < 80 ? 8 : 10} fontWeight={600}>
                      {name}
                    </text>
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c-muted)', fontWeight: 600 }}>#</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c-muted)', fontWeight: 600 }}>Instituție</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c-muted)', fontWeight: 600 }}>Categorie</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--c-muted)', fontWeight: 600 }}>Buget total</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--c-muted)', fontWeight: 600 }}>% din total</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst, i) => (
                <tr key={inst.fileRef} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                  onClick={() => setSelectedInst(inst.fileRef)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '8px 12px', color: 'var(--c-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{inst.name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <Badge label={INSTITUTION_CATEGORIES[inst.category]?.label || inst.category} color={INSTITUTION_CATEGORIES[inst.category]?.color || '#666'} />
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{fmtLei(inst.totalBuget)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-muted)' }} className="tabular-nums">{pct(inst.totalBuget, totalBuget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16, fontSize: 11, color: 'var(--c-muted)' }}>
        {Object.entries(INSTITUTION_CATEGORIES).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: v.color, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Institution Detail ───────────────────────────────────────
function InstitutionDetail({ inst, onBack }) {
  const ceAgg = {};
  for (const cf of inst.byCF) {
    for (const ce of cf.byCE) {
      ceAgg[ce.ce] = (ceAgg[ce.ce] || 0) + ce.total;
    }
  }
  const ceData = Object.entries(ceAgg)
    .map(([ce, total]) => ({ ce, label: CE_LABELS[ce] || `CE ${ce}`, total }))
    .sort((a, b) => b.total - a.total);

  const cfData = inst.byCF.map(cf => ({
    ...cf,
    label: CF_LABELS[cf.cf] || `CF ${cf.cf}`,
  }));

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 13, padding: 0, marginBottom: 16 }}>
        ← Înapoi la lista de instituții
      </button>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{inst.name}</h2>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '0 0 20px' }}>
        CUI: {inst.codFiscal} &middot; Total: <strong>{fmtLei(inst.totalBuget)} lei</strong> &middot;{' '}
        <Badge label={INSTITUTION_CATEGORIES[inst.category]?.label || inst.category} color={INSTITUTION_CATEGORIES[inst.category]?.color || '#666'} />
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* By CF */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Pe funcții (CF)</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, cfData.length * 32)}>
            <BarChart data={cfData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
              <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10, fill: 'var(--c-text)' }}
                tickFormatter={n => n.length > 25 ? n.slice(0, 22) + '…' : n} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                {cfData.map((c, i) => <Cell key={i} fill={CF_COLORS[c.cf] || '#666'} />)}
                <LabelList dataKey="total" position="right" formatter={fmtLei} style={{ fontSize: 10, fill: 'var(--c-text)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By CE */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Pe tipuri economice (CE)</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, ceData.length * 32)}>
            <BarChart data={ceData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
              <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10, fill: 'var(--c-text)' }}
                tickFormatter={n => n.length > 25 ? n.slice(0, 22) + '…' : n} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                {ceData.map((c, i) => <Cell key={i} fill={CE_COLORS[c.ce] || '#666'} />)}
                <LabelList dataKey="total" position="right" formatter={fmtLei} style={{ fontSize: 10, fill: 'var(--c-text)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Surse */}
      {Object.keys(inst.bySursa).length > 1 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Surse de finanțare</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {Object.entries(inst.bySursa).sort((a, b) => b[1] - a[1]).map(([sursa, amount]) => (
              <div key={sursa} style={{ padding: '8px 16px', borderRadius: 8, background: (SURSA_COLORS[sursa] || '#666') + '15', border: `1px solid ${SURSA_COLORS[sursa] || '#666'}30` }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{SURSA_LABELS[sursa] || sursa}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }} className="tabular-nums">{fmtLei(amount)} lei</div>
                <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{pct(amount, inst.totalBuget)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FUNCTIONS TAB (CF) ──────────────────────────────────────
function FunctiiTab({ data, total }) {
  const [selected, setSelected] = useState(null);
  const chartData = data.filter(c => c.total > 0).map(c => ({
    ...c, label: CF_LABELS[c.cf] || `CF ${c.cf}`,
  }));

  const selectedItem = selected ? chartData.find(c => c.cf === selected) : null;

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Cheltuieli pe clasificare funcțională</h3>
        <ResponsiveContainer width="100%" height={Math.max(350, chartData.length * 28)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
            <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11, fill: 'var(--c-text)' }}
              tickFormatter={n => n.length > 30 ? n.slice(0, 27) + '…' : n} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]} cursor="pointer"
              onClick={(d) => setSelected(d.cf === selected ? null : d.cf)}>
              {chartData.map((c, i) => <Cell key={i} fill={selected && c.cf !== selected ? '#ccc' : (CF_COLORS[c.cf] || '#666')} />)}
              <LabelList dataKey="total" position="right" formatter={fmtLei} style={{ fontSize: 10, fill: 'var(--c-text)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail for selected CF */}
      {selectedItem && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{selectedItem.label}</h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: 12 }}>✕ Închide</button>
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>Total: <strong>{fmtLei(selectedItem.total)} lei</strong> ({pct(selectedItem.total, total)} din buget)</div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)', margin: '0 0 8px' }}>Instituții care contribuie:</h4>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {selectedItem.institutions.sort((a, b) => b.total - a.total).map((inst, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                <span>{inst.name}</span>
                <span className="tabular-nums" style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmtLei(inst.total)} lei</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ECONOMIC TAB (CE) ────────────────────────────────────────
function EconomicTab({ data, total }) {
  const [selected, setSelected] = useState(null);
  const chartData = data.filter(c => c.total > 0).map(c => ({
    ...c, label: CE_LABELS[c.ce] || `CE ${c.ce}`,
  }));

  const pieData = chartData.slice(0, 8);
  const selectedItem = selected ? chartData.find(c => c.ce === selected) : null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Structura cheltuielilor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="total" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={110}
                label={({ label, percent }) => `${label?.slice(0, 18)} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--c-muted)' }} style={{ fontSize: 10 }}
                cursor="pointer" onClick={(d) => setSelected(d.ce === selected ? null : d.ce)}>
                {pieData.map((c, i) => <Cell key={i} fill={CE_COLORS[c.ce] || '#666'} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtLei(v) + ' lei'} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Detalii pe tipuri economice</h3>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {chartData.map((c, i) => (
              <div key={c.ce}
                onClick={() => setSelected(c.ce === selected ? null : c.ce)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                  background: c.ce === selected ? 'var(--bg-surface)' : '' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: CE_COLORS[c.ce] || '#666', flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{c.label}</span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 600 }}>{fmtLei(c.total)}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{pct(c.total, total)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedItem && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{selectedItem.label}: {fmtLei(selectedItem.total)} lei</h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: 12 }}>✕</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {selectedItem.institutions.sort((a, b) => b.total - a.total).map((inst, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                <span>{inst.name}</span>
                <span className="tabular-nums" style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmtLei(inst.total)} lei</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HOSPITALS TAB ────────────────────────────────────────────
function SpitaleTab({ hospitals, total, sort, setSort }) {
  // CE aggregation per hospital
  const hospWithCE = hospitals.map(h => {
    const ceAgg = {};
    for (const cf of h.byCF) {
      for (const ce of cf.byCE) {
        ceAgg[ce.ce] = (ceAgg[ce.ce] || 0) + ce.total;
      }
    }
    return { ...h, personal: ceAgg['10'] || 0, bunuri: ceAgg['20'] || 0, investitii: ceAgg['71'] || 0, altele: h.totalBuget - (ceAgg['10'] || 0) - (ceAgg['20'] || 0) - (ceAgg['71'] || 0) };
  });

  const totalPersonal = hospWithCE.reduce((s, h) => s + h.personal, 0);
  const totalBunuri = hospWithCE.reduce((s, h) => s + h.bunuri, 0);
  const totalInvest = hospWithCE.reduce((s, h) => s + h.investitii, 0);

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.5 }}>
        Bugetele de mai jos reprezintă <strong style={{ color: 'var(--c-text)' }}>veniturile proprii</strong> ale spitalelor (sursa F), provenite în principal din contractele cu <strong style={{ color: 'var(--c-text)' }}>CNAS</strong> (Casa Națională de Asigurări de Sănătate), nu din bugetul local al PMB. Primăria alocă separat <strong style={{ color: 'var(--c-text)' }}>0,72 mld lei</strong> din bugetul local către ASSMB (Administrația Spitalelor), care coordonează aceste unități.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total spitale (venituri proprii)" value={fmtLei(total) + ' lei'} sub={`${hospitals.length} spitale · sursa F`} color="#993556" />
        <MetricCard label="Personal" value={fmtLei(totalPersonal) + ' lei'} sub={pct(totalPersonal, total)} color="#185FA5" />
        <MetricCard label="Bunuri & servicii" value={fmtLei(totalBunuri) + ' lei'} sub={pct(totalBunuri, total)} color="#639922" />
        <MetricCard label="Investiții" value={fmtLei(totalInvest) + ' lei'} sub={pct(totalInvest, total)} color="#D85A30" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
          style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: 12 }}>
          {sort === 'desc' ? '↓ Descrescător' : '↑ Crescător'}
        </button>
      </div>

      {/* Stacked bar chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Comparație buget spitale</h3>
        <ResponsiveContainer width="100%" height={Math.max(400, hospitals.length * 30)}>
          <BarChart data={hospWithCE} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis type="number" tickFormatter={fmtLei} tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
            <YAxis type="category" dataKey="name" width={260} tick={{ fontSize: 10, fill: 'var(--c-text)' }}
              tickFormatter={n => n.length > 40 ? n.slice(0, 37) + '…' : n} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="personal" name="Personal" stackId="a" fill="#185FA5" />
            <Bar dataKey="bunuri" name="Bunuri" stackId="a" fill="#639922" />
            <Bar dataKey="investitii" name="Investiții" stackId="a" fill="#D85A30" />
            <Bar dataKey="altele" name="Altele" stackId="a" fill="#9E9E9E" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="totalBuget" position="right" formatter={fmtLei} style={{ fontSize: 10, fill: 'var(--c-text)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600 }}>Spital</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600 }}>Total</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600 }}>Personal</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600 }}>Bunuri</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600 }}>Investiții</th>
            </tr>
          </thead>
          <tbody>
            {hospWithCE.map(h => (
              <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '6px 10px' }}>{h.name}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{fmtLei(h.totalBuget)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }} className="tabular-nums">{fmtLei(h.personal)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }} className="tabular-nums">{fmtLei(h.bunuri)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }} className="tabular-nums">{fmtLei(h.investitii)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SOURCES TAB ──────────────────────────────────────────────
function SurseTab({ data, total, institutions }) {
  const pieData = data.filter(s => s.total > 0);

  // Top institutions per sursa for the selected one
  const [selected, setSelected] = useState(null);

  const selectedInsts = useMemo(() => {
    if (!selected) return [];
    return institutions
      .filter(i => i.bySursa[selected])
      .map(i => ({ name: i.name, total: i.bySursa[selected] }))
      .sort((a, b) => b.total - a.total);
  }, [selected, institutions]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Repartiție pe surse de finanțare</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="total" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={110}
                label={({ label, percent }) => `${label?.slice(0, 18)} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--c-muted)' }} style={{ fontSize: 10 }}
                cursor="pointer" onClick={(d) => setSelected(d.sursa === selected ? null : d.sursa)}>
                {pieData.map((s, i) => <Cell key={i} fill={SURSA_COLORS[s.sursa] || '#999'} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtLei(v) + ' lei'} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Detalii</h3>
          {data.map(s => (
            <div key={s.sursa}
              onClick={() => setSelected(s.sursa === selected ? null : s.sursa)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                background: s.sursa === selected ? 'var(--bg-surface)' : '' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SURSA_COLORS[s.sursa] || '#666', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>Sursa {s.sursa}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 600 }}>{fmtLei(s.total)}</div>
                <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{pct(s.total, total)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && selectedInsts.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              {SURSA_LABELS[selected] || selected}: instituții
            </h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: 12 }}>✕</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {selectedInsts.map((inst, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                <span>{inst.name}</span>
                <span className="tabular-nums" style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmtLei(inst.total)} lei</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
