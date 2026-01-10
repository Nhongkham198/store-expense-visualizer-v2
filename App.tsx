import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  LayoutDashboard, List, FileSpreadsheet, Wallet, TrendingUp, AlertCircle, 
  Menu, X, RefreshCw, Database, Plus, Trash2, Link as LinkIcon, Cloud, CloudOff,
  Download, Upload, FileText, ChevronRight, ExternalLink, Filter, Search
} from 'lucide-react';
import { Transaction, ViewMode, SheetConfig } from './types';
import { generateMockData } from './utils/mockData';
import { fetchSheetData } from './services/sheetService';
import { getSheetUrlsFromFirebase, saveSheetUrlsToFirebase } from './services/firebaseService';
import { StatsCard } from './components/StatsCard';
import { TransactionsTable } from './components/TransactionsTable';

// Colors for charts
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#6366F1'];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewMode>(ViewMode.DASHBOARD);
  
  // Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUsingRealData, setIsUsingRealData] = useState(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  
  // Filter State (Interactive Charts)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number | null>(null);
  const [sheetSearchTerm, setSheetSearchTerm] = useState<string>('');
  
  // UI State for Multi-Sheet Input
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Initialize state with default valid URL and Name
  const [sheets, setSheets] = useState<SheetConfig[]>([
    { url: 'https://docs.google.com/spreadsheets/d/1ZJ01yx27FMzBDKdXAF3e1Gy9s6HokAC4FsO6BESzi_w/edit#gid=0', name: 'ข้อมูลตัวอย่าง (Main)' }
  ]);
  
  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to normalize data (Migration from string[] to SheetConfig[])
  const normalizeData = (data: any): SheetConfig[] => {
    if (!Array.isArray(data)) return [];
    if (data.length === 0) return [];
    
    // Check if it is old string[] format
    if (typeof data[0] === 'string') {
        return data.map((url: string, index: number) => ({
            url,
            name: `Sheet ${index + 1}`
        }));
    }
    // Assume it is already SheetConfig[]
    return data as SheetConfig[];
  };

  // -- CHANGED: Load from Firebase on Mount --
  useEffect(() => {
    const loadSettings = async () => {
      const remoteData = await getSheetUrlsFromFirebase();
      if (remoteData) {
        const normalized = normalizeData(remoteData);
        if (normalized.length > 0) {
            setSheets(normalized);
            setIsFirebaseConnected(true);
            loadData(normalized);
            return;
        }
      } 
      
      // Fallback to local storage
      const savedLocal = localStorage.getItem('storeViz_sheetUrls');
      if (savedLocal) {
            try {
            const parsed = JSON.parse(savedLocal);
            const normalized = normalizeData(parsed);
            setSheets(normalized);
            loadData(normalized);
            } catch(e) {}
      } else {
            // Initial Load with default
            loadData();
      }
    };
    loadSettings();
  }, []);

  // -- CHANGED: Save to Firebase AND LocalStorage --
  const handleConfigChange = (newSheets: SheetConfig[]) => {
    setSheets(newSheets);
    // 1. Save Local (Backup)
    localStorage.setItem('storeViz_sheetUrls', JSON.stringify(newSheets));
    // 2. Save Cloud (Firebase)
    saveSheetUrlsToFirebase(newSheets).then(() => {
        setIsFirebaseConnected(true);
    }).catch(() => {
        setIsFirebaseConnected(false);
    });
  };

  const loadData = async (customSheets?: SheetConfig[]) => {
    setIsLoading(true);
    setError(null);
    const sheetsToFetch = customSheets || sheets;

    try {
      // Filter out empty strings
      const validSheets = sheetsToFetch.filter(s => s.url.trim() !== '');
      
      if (validSheets.length === 0) {
        setTransactions(generateMockData());
        setIsUsingRealData(false);
        setIsLoading(false);
        return;
      }

      // Fetch all sheets in parallel, passing Name info
      const promises = validSheets.map((sheet, index) => fetchSheetData(sheet.url, index, sheet.name));
      const results = await Promise.all(promises);
      
      // Flatten arrays
      const combinedData = results.flat();

      if (combinedData.length > 0) {
        // Sort by Date Descending
        combinedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setTransactions(combinedData);
        setIsUsingRealData(true);
      } else {
        setTransactions(generateMockData());
        setIsUsingRealData(false);
        setError("เชื่อมต่อได้แต่ไม่พบข้อมูลในลิงก์ที่ระบุ (แสดงข้อมูลตัวอย่างแทน)");
      }
    } catch (err) {
      console.error("Fetch failed", err);
      setTransactions(generateMockData());
      setIsUsingRealData(false);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูล (แสดงข้อมูลตัวอย่างแทน)");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = () => {
    loadData(sheets);
  };

  const addSheet = () => {
    const newSheets = [...sheets, { url: '', name: '' }];
    handleConfigChange(newSheets);
  };

  const updateSheet = (index: number, field: keyof SheetConfig, value: string) => {
    const newSheets = [...sheets];
    newSheets[index] = { ...newSheets[index], [field]: value };
    handleConfigChange(newSheets);
  };

  const removeSheet = (index: number) => {
    const newSheets = sheets.filter((_, i) => i !== index);
    const finalSheets = newSheets.length ? newSheets : [{ url: '', name: '' }];
    handleConfigChange(finalSheets);
  };

  // Export Config to JSON file
  const handleExportConfig = () => {
    const dataStr = JSON.stringify(sheets, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store-viz-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import Config from JSON file
  const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result);
          // Normalize to ensure compatibility
          const normalized = normalizeData(parsed);
          
          if (window.confirm(`พบการตั้งค่า ${normalized.length} รายการ ต้องการนำเข้าแทนที่ข้อมูลปัจจุบันหรือไม่?`)) {
            handleConfigChange(normalized);
            alert("นำเข้าข้อมูลสำเร็จ!");
          }
        }
      } catch (err) {
        alert("เกิดข้อผิดพลาดในการอ่านไฟล์");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Computations ---

  // 1. Filter Transactions based on selected sheet
  // NOTE: This is for the charts below. They must listen to Sheet selection AND Category Selection
  const filteredTransactions = useMemo(() => {
    let tx = transactions;
    if (selectedSheetIndex !== null) {
      tx = tx.filter(t => t.sheetSourceIndex === selectedSheetIndex);
    }
    return tx;
  }, [transactions, selectedSheetIndex]);

  // 2. Compute Sheet Summaries for Cards
  // UPDATED: Now respects selectedCategory to calculate totals per sheet for that category
  const sheetSummaries = useMemo(() => {
    return sheets.map((sheet, index) => {
       // 1. Get transactions for this sheet
       const sheetTx = transactions.filter(t => t.sheetSourceIndex === index);
       
       // 2. Filter by Category if selected
       const matchingTx = selectedCategory 
          ? sheetTx.filter(t => (t.category || 'อื่นๆ') === selectedCategory)
          : sheetTx;

       const total = matchingTx.reduce((sum, t) => sum + t.amount, 0);
       
       return {
         ...sheet,
         total,
         count: matchingTx.length,
         index,
         hasMatch: matchingTx.length > 0 // Flag to dim card if not relevant
       };
    });
  }, [sheets, transactions, selectedCategory]);

  // Overall Total (respects Sheet filter + Category filter if needed for KPI)
  const totalExpense = useMemo(() => {
     let tx = filteredTransactions;
     if (selectedCategory) {
        tx = tx.filter(t => (t.category || 'อื่นๆ') === selectedCategory);
     }
     return tx.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredTransactions, selectedCategory]);

  // Category Data for Pie Chart (Respects Sheet Filter)
  const categoryData = useMemo(() => {
    const summary: Record<string, number> = {};
    filteredTransactions.forEach(t => {
      const cat = t.category || 'อื่นๆ';
      summary[cat] = (summary[cat] || 0) + t.amount;
    });
    return Object.keys(summary).map(key => ({
      name: key,
      value: summary[key]
    })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  // Daily Data (Respects Sheet Filter + Category Filter)
  const dailyData = useMemo(() => {
    // 1. Filter source data based on selection from Pie Chart
    const sourceTransactions = selectedCategory 
        ? filteredTransactions.filter(t => (t.category || 'อื่นๆ') === selectedCategory)
        : filteredTransactions;

    const summary: Record<string, number> = {};
    sourceTransactions.forEach(t => {
      // Use display date for grouping to show Thai years in chart
      const parts = t.displayDate.split('/');
      let dateKey = t.displayDate;
      if (parts.length === 3) {
         // Show DD/MM/YY(BE) e.g. 08/01/69
         dateKey = `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`; 
      }
      summary[dateKey] = (summary[dateKey] || 0) + t.amount;
    });
    
    // Sort logic
    const uniqueKeys: string[] = Array.from<string>(new Set(sourceTransactions.map(t => {
         const parts = t.displayDate.split('/');
         if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`;
         return t.displayDate;
    }))).reverse();

    return uniqueKeys.map(key => ({
      date: key,
      amount: summary[key] || 0
    }));
  }, [filteredTransactions, selectedCategory]);

  const topCategory = categoryData.length > 0 ? categoryData[0] : { name: '-', value: 0 };

  // --- Render Helpers ---

  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      {!isUsingRealData && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800 text-sm">
          <AlertCircle size={20} />
          <span>
            กำลังแสดงข้อมูลตัวอย่าง (Mock Data) เนื่องจากไม่สามารถเชื่อมต่อ Google Sheet ได้ 
            <button onClick={() => setActiveTab(ViewMode.IMPORT)} className="underline ml-1 font-semibold hover:text-yellow-900">
              ตั้งค่าการเชื่อมต่อ
            </button>
          </span>
        </div>
      )}
      
      {/* --- Sheet Cards (File View) --- */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
             <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet size={16} /> เลือกแผ่นงาน (Select File)
                </h3>
                {selectedCategory && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-fade-in">
                        <Filter size={10} />
                        กรอง: {selectedCategory}
                    </span>
                )}
             </div>
             
             <div className="flex items-center gap-3">
                 {/* Search Input */}
                 <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="ค้นหาชื่อไฟล์..."
                        value={sheetSearchTerm}
                        onChange={(e) => setSheetSearchTerm(e.target.value)}
                        className="pl-8 pr-3 py-1 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-100 w-32 focus:w-48 transition-all"
                    />
                 </div>

                {(selectedSheetIndex !== null || selectedCategory !== null || sheetSearchTerm !== '') && (
                <button 
                    onClick={() => { setSelectedSheetIndex(null); setSelectedCategory(null); setSheetSearchTerm(''); }}
                    className="text-xs text-red-500 hover:underline font-medium whitespace-nowrap"
                >
                    รีเซ็ต (Reset)
                </button>
                )}
             </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 'All' Card - Always Visible */}
            <div 
                onClick={() => setSelectedSheetIndex(null)}
                className={`
                    p-4 rounded-xl border cursor-pointer transition-all duration-200 group
                    ${selectedSheetIndex === null 
                        ? 'bg-blue-600 border-blue-600 shadow-md transform scale-[1.02]' 
                        : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-sm'
                    }
                `}
            >
                <div className="flex justify-between items-start">
                    <div className={`p-2 rounded-lg ${selectedSheetIndex === null ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                        <LayoutDashboard size={20} />
                    </div>
                </div>
                <div className="mt-3">
                    <p className={`text-sm font-medium ${selectedSheetIndex === null ? 'text-blue-100' : 'text-gray-500'}`}>
                        {selectedCategory ? `รวม "${selectedCategory}"` : 'ภาพรวมทั้งหมด (All)'}
                    </p>
                    <h4 className={`text-lg font-bold ${selectedSheetIndex === null ? 'text-white' : 'text-gray-800'}`}>
                        {selectedCategory ? `฿${sheetSummaries.reduce((a,b)=>a+b.total, 0).toLocaleString()}` : `${sheets.length} แผ่นงาน`}
                    </h4>
                </div>
            </div>

            {/* Individual Sheet Cards - Filtered Logic */}
            {sheetSummaries
                .filter(sheet => {
                    // 1. Search overrides everything
                    if (sheetSearchTerm.trim()) {
                        return sheet.name.toLowerCase().includes(sheetSearchTerm.toLowerCase());
                    }
                    // 2. If Category selected, show only matching sheets
                    if (selectedCategory) {
                        return sheet.hasMatch;
                    }
                    // 3. Default: Show nothing (clean view)
                    return false;
                })
                .map((sheet) => (
                    <div 
                        key={sheet.index}
                        onClick={() => setSelectedSheetIndex(sheet.index)}
                        className={`
                            relative p-4 rounded-xl border cursor-pointer transition-all duration-200 group animate-fade-in
                            ${selectedSheetIndex === sheet.index
                                ? 'bg-emerald-600 border-emerald-600 shadow-md transform scale-[1.02] z-10' 
                                : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-sm'
                            }
                        `}
                    >
                        <div className="flex justify-between items-start">
                            <div className={`p-2 rounded-lg ${selectedSheetIndex === sheet.index ? 'bg-white/20 text-white' : 'bg-green-50 text-green-600'}`}>
                                <FileSpreadsheet size={20} />
                            </div>
                            {sheet.url && (
                                <a 
                                    href={sheet.url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()} 
                                    className={`p-1.5 rounded-md transition-colors ${selectedSheetIndex === sheet.index ? 'text-emerald-100 hover:bg-white/20 hover:text-white' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                                    title="เปิด Google Sheet ต้นฉบับ"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </div>
                        <div className="mt-3">
                            <p className={`text-sm font-medium truncate pr-2 ${selectedSheetIndex === sheet.index ? 'text-emerald-100' : 'text-gray-500'}`}>
                                {sheet.name || `Sheet ${sheet.index + 1}`}
                            </p>
                            <h4 className={`text-lg font-bold ${selectedSheetIndex === sheet.index ? 'text-white' : 'text-gray-800'}`}>
                                ฿{sheet.total.toLocaleString()}
                            </h4>
                            <div className={`text-xs mt-1 ${selectedSheetIndex === sheet.index ? 'text-emerald-200' : 'text-gray-400'}`}>
                                {selectedCategory 
                                   ? `พบ ${sheet.count} รายการ`
                                   : `${sheet.count} รายการ`
                                }
                            </div>
                        </div>
                    </div>
                ))
            }

            {/* Empty State / Hint */}
            {!selectedCategory && !sheetSearchTerm && (
                <div className="hidden sm:flex col-span-1 lg:col-span-3 items-center justify-center p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm bg-gray-50/50">
                    <div className="text-center">
                        <p>👆 เลือกหมวดหมู่จากกราฟ หรือพิมพ์ค้นหาเพื่อดูไฟล์ที่เกี่ยวข้อง</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 pb-2 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-800 flex items-center gap-2">
             {selectedCategory && <Filter size={20} className="text-indigo-500" />}
             {selectedSheetIndex !== null 
                ? `วิเคราะห์: ${sheets[selectedSheetIndex]?.name || 'Sheet'}`
                : 'วิเคราะห์ภาพรวม (Overall Analysis)'}
             {selectedCategory && (
                <span className="text-gray-400 text-base font-normal">
                    — หมวด: <span className="text-indigo-600 font-medium">{selectedCategory}</span>
                </span>
             )}
          </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title={selectedCategory ? `ยอดรวม "${selectedCategory}"` : "ยอดรวมค่าใช้จ่าย (Total)"}
          value={`฿${totalExpense.toLocaleString()}`} 
          subValue={selectedCategory 
            ? `จาก ${filteredTransactions.filter(t => (t.category||'อื่นๆ') === selectedCategory).length} รายการ` 
            : `จาก ${filteredTransactions.length} รายการ`}
          icon={<Wallet size={24} />}
          colorClass="bg-blue-500"
        />
        <StatsCard 
          title="หมวดหมู่สูงสุด (Top Category)" 
          value={selectedCategory ? selectedCategory : topCategory.name} 
          subValue={selectedCategory ? "กำลังเลือก (Selected)" : `฿${topCategory.value.toLocaleString()}`}
          icon={<TrendingUp size={24} />}
          colorClass="bg-emerald-500"
        />
        <StatsCard 
          title="เฉลี่ยต่อบิล (Avg/Bill)" 
          value={`฿${
              selectedCategory
              ? (filteredTransactions.filter(t => (t.category||'อื่นๆ')===selectedCategory).length > 0
                    ? Math.round(totalExpense / filteredTransactions.filter(t => (t.category||'อื่นๆ')===selectedCategory).length).toLocaleString()
                    : 0)
              : (filteredTransactions.length > 0 ? Math.round(totalExpense / filteredTransactions.length).toLocaleString() : 0)
          }`}
          subValue="บาทต่อครั้ง"
          icon={<FileSpreadsheet size={24} />}
          colorClass="bg-amber-500"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-gray-800">
               แนวโน้มรายวัน (Daily Trend)
               {selectedCategory && (
                 <span className="ml-2 text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded-md font-normal">
                   — {selectedCategory}
                 </span>
               )}
             </h3>
             {selectedCategory && (
               <button 
                 onClick={() => setSelectedCategory(null)}
                 className="text-xs text-gray-500 hover:text-red-500 underline"
               >
                 รีเซ็ต (Show All)
               </button>
             )}
          </div>
          <div className="h-72">
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tick={{fontSize: 10}} />
                  <YAxis stroke="#9CA3AF" tick={{fontSize: 12}} tickFormatter={(value) => `฿${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`฿${value.toLocaleString()}`, 'Amount']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="amount" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                ไม่มีข้อมูลสำหรับหมวดหมู่นี้
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown (Pie Chart) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">สัดส่วนค่าใช้จ่าย (By Category)</h3>
          <p className="text-xs text-gray-400 mb-2 -mt-2">💡 คลิกที่กราฟ หรือ <strong>รายการด้านขวา</strong> เพื่อกรองข้อมูล</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  onClick={(data) => {
                    // Toggle Logic
                    setSelectedCategory(prev => prev === data.name ? null : data.name);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {categoryData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]} 
                      stroke={selectedCategory === entry.name ? "#333" : "none"}
                      strokeWidth={selectedCategory === entry.name ? 2 : 0}
                      fillOpacity={selectedCategory && selectedCategory !== entry.name ? 0.3 : 1}
                      style={{ cursor: 'pointer', outline: 'none', transition: 'all 0.3s ease' }}
                    />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => [`฿${value.toLocaleString()}`, 'Amount']} />
                <Legend 
                  layout="vertical" 
                  verticalAlign="middle" 
                  align="right" 
                  wrapperStyle={{ fontSize: '12px', cursor: 'pointer' }}
                  onClick={(e) => {
                    const categoryName = e.value;
                    setSelectedCategory(prev => prev === categoryName ? null : categoryName);
                  }}
                  formatter={(value) => (
                    <span style={{ 
                      opacity: selectedCategory ? (selectedCategory === value ? 1 : 0.4) : 1,
                      fontWeight: selectedCategory === value ? 'bold' : 'normal',
                      color: selectedCategory === value ? '#1F2937' : '#4B5563',
                      transition: 'all 0.3s ease'
                    }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderImportTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto">
      <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
            <Database size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-800">จัดการข้อมูล Google Sheet</h3>
          <p className="text-gray-500 mt-2">
            เพิ่มลิงก์ Google Sheet และตั้งชื่อเพื่อให้จำง่าย <br/>
            (เช่น "ยอดเดือนมกราคม", "สาขา 1")
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
             {isFirebaseConnected ? (
               <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                 <Cloud size={14} /> บันทึกบน Cloud (Firebase)
               </span>
             ) : (
               <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                 <CloudOff size={14} /> บันทึกในเครื่อง (Local)
               </span>
             )}
          </div>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
           รายการแผ่นงาน (List of Sheets)
        </label>
        
        {sheets.map((sheet, index) => (
            <div key={index} className="flex flex-col md:flex-row gap-2 items-start md:items-center animate-fade-in bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="bg-white border p-2 rounded text-gray-500 text-xs w-8 text-center shrink-0">{index + 1}</div>
                  
                  {/* Name Input */}
                  <div className="relative w-full md:w-48">
                    <input 
                        type="text" 
                        value={sheet.name}
                        onChange={(e) => updateSheet(index, 'name', e.target.value)}
                        className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="ชื่อชีท (เช่น ม.ค. 67)"
                    />
                    <FileText size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  </div>
              </div>

              {/* URL Input */}
              <div className="relative flex-1 w-full">
                <input 
                    type="text" 
                    value={sheet.url}
                    onChange={(e) => updateSheet(index, 'url', e.target.value)}
                    className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.google.com/spreadsheets/..."
                />
                <LinkIcon size={16} className="absolute left-3 top-2.5 text-gray-400" />
              </div>

              <button 
                onClick={() => removeSheet(index)}
                className="self-end md:self-auto p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="ลบรายการนี้"
              >
                <Trash2 size={18} />
              </button>
            </div>
        ))}

        <div className="flex gap-3 pt-2">
            <button 
              onClick={addSheet}
              className="flex-1 py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Plus size={16} />
              เพิ่มรายการ (Add Sheet)
            </button>
            
            <button 
              onClick={handleSync}
              disabled={isLoading}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm font-medium"
            >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "รวมข้อมูลและแสดงผล (Sync All)" : "รวมข้อมูลและแสดงผล (Sync All)"}
            </button>
        </div>

        {/* Import/Export Tools */}
        <div className="mt-8 pt-6 border-t border-gray-100">
           <h4 className="text-sm font-semibold text-gray-700 mb-3">เครื่องมือจัดการ (Tools)</h4>
           <div className="flex gap-3">
              <button 
                 onClick={handleExportConfig}
                 className="flex-1 py-2 px-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors"
              >
                 <Download size={16} />
                 ส่งออก (Export)
              </button>
              
              <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="flex-1 py-2 px-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors"
              >
                 <Upload size={16} />
                 นำเข้า (Import)
              </button>
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept=".json" 
                 onChange={handleImportConfig}
              />
           </div>
           <p className="text-xs text-gray-400 mt-2 text-center">
             สามารถส่งออกรายการเป็นไฟล์ .json เพื่อสำรองข้อมูลได้
           </p>
        </div>

        {!isFirebaseConnected && (
            <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg mt-4 text-xs text-orange-800">
               <strong>⚠️ คำเตือน:</strong> ขณะนี้ระบบยังไม่ได้เชื่อมต่อ Firebase (บันทึกเฉพาะในเครื่องนี้)
            </div>
        )}
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 mt-4">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:relative ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-100 justify-between md:justify-start">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
             <LayoutDashboard />
             <span>StoreViz</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-gray-500">
            <X size={24} />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          <button 
            onClick={() => { setActiveTab(ViewMode.DASHBOARD); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === ViewMode.DASHBOARD ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutDashboard size={18} />
            ภาพรวม (Dashboard)
          </button>
          <button 
             onClick={() => { setActiveTab(ViewMode.TRANSACTIONS); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === ViewMode.TRANSACTIONS ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <List size={18} />
            รายการบิล (Transactions)
          </button>
          <button 
            onClick={() => { setActiveTab(ViewMode.IMPORT); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === ViewMode.IMPORT ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <FileSpreadsheet size={18} />
            จัดการข้อมูล (Data Source)
          </button>
        </nav>
        
        <div className="absolute bottom-0 left-0 w-full p-6 border-t border-gray-100">
           <div className={`p-4 rounded-xl ${isUsingRealData ? 'bg-green-50' : 'bg-blue-50'}`}>
              <div className="flex items-center justify-between mb-1">
                 <p className={`text-xs font-semibold ${isUsingRealData ? 'text-green-600' : 'text-blue-600'}`}>สถานะข้อมูล</p>
                 {isLoading && <RefreshCw size={12} className="animate-spin text-gray-500" />}
              </div>
              <p className="text-sm text-gray-700 truncate">
                {isUsingRealData ? 'Google Sheet Online' : 'Mock Data (จำลอง)'}
              </p>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="md:hidden h-16 bg-white border-b border-gray-200 flex items-center px-4 justify-between">
           <h1 className="font-bold text-gray-800">StoreViz</h1>
           <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-600">
             <Menu size={24} />
           </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                  {activeTab === ViewMode.DASHBOARD && 'วิเคราะห์ค่าใช้จ่ายร้าน (Store Overview)'}
                  {activeTab === ViewMode.TRANSACTIONS && 'บันทึกรายจ่ายรวม (Transactions)'}
                  {activeTab === ViewMode.IMPORT && 'จัดการลิงก์ข้อมูล (Data Source)'}
                </h1>
                <p className="text-gray-500 mt-1">
                  {isUsingRealData 
                    ? `รวมข้อมูลจริงจาก ${sheets.filter(s=>s.url).length} แผ่นงาน (${transactions.length} รายการ)` 
                    : 'ข้อมูลจำลอง (Demo Mode)'}
                </p>
              </div>
              {activeTab !== ViewMode.IMPORT && (
                <button 
                  onClick={handleSync}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm self-start md:self-auto"
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                  รีเฟรชข้อมูล
                </button>
              )}
            </div>

            {activeTab === ViewMode.DASHBOARD && renderDashboard()}
            
            {activeTab === ViewMode.TRANSACTIONS && (
              <TransactionsTable transactions={filteredTransactions} sheets={sheets} />
            )}

            {activeTab === ViewMode.IMPORT && renderImportTab()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;