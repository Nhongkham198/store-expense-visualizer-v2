import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Rectangle
} from 'recharts';
import { 
  LayoutDashboard, List, FileSpreadsheet, Wallet, TrendingUp, AlertCircle, 
  Menu, X, RefreshCw, Database, Plus, Trash2, Link as LinkIcon, Cloud, CloudOff,
  Download, Upload, FileText, ChevronRight, ExternalLink, Filter, Search,
  ArrowDownWideNarrow, ArrowUpNarrowWide, Clock, Calendar, Image as ImageIcon,
  Lock, Unlock
} from 'lucide-react';
import { Transaction, ViewMode, SheetConfig } from './types';
import { generateMockData } from './utils/mockData';
import { fetchSheetData } from './services/sheetService';
import { 
  getSheetUrlsFromFirebase, 
  saveSheetUrlsToFirebase, 
  getLogoUrlFromFirebase, 
  saveLogoUrlToFirebase 
} from './services/firebaseService';
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
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null); // NEW: Time Filter
  const [sheetSearchTerm, setSheetSearchTerm] = useState<string>('');
  
  // Chart View State
  const [trendView, setTrendView] = useState<'daily' | 'monthly' | 'yearly'>('daily');

  // UI State for Multi-Sheet Input
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // -- NEW STATE for Import Tab Design --
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const [sortMode, setSortMode] = useState<'dateDesc' | 'dateAsc' | 'modified'>('dateDesc');
  
  // -- NEW STATE for Custom Logo --
  const [logoUrl, setLogoUrl] = useState<string>('');
  
  // -- AUTH STATE --
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  
  // Refs for scrolling logic
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Initialize state with default valid URL and Name
  const [sheets, setSheets] = useState<SheetConfig[]>([
    { url: 'https://docs.google.com/spreadsheets/d/1ZJ01yx27FMzBDKdXAF3e1Gy9s6HokAC4FsO6BESzi_w/edit#gid=0', name: 'ข้อมูลตัวอย่าง (Main)', lastModified: Date.now() }
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
            name: `Sheet ${index + 1}`,
            lastModified: Date.now()
        }));
    }
    // Assume it is already SheetConfig[]
    return data.map((d: any) => ({
        ...d,
        lastModified: d.lastModified || Date.now() // Ensure lastModified exists
    }));
  };

  // -- CHANGED: Load from Firebase on Mount --
  useEffect(() => {
    const loadSettings = async () => {
      // 1. Load Sheets
      const remoteData = await getSheetUrlsFromFirebase();
      if (remoteData) {
        const normalized = normalizeData(remoteData);
        if (normalized.length > 0) {
            setSheets(normalized);
            setIsFirebaseConnected(true);
            loadData(normalized);
        }
      } else {
        // Fallback to local storage for sheets
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
      }
      
      // 2. Load Custom Logo (Check Firebase FIRST for sync)
      const remoteLogo = await getLogoUrlFromFirebase();
      if (remoteLogo) {
          setLogoUrl(remoteLogo);
          localStorage.setItem('storeViz_logoUrl', remoteLogo); // Cache locally
      } else {
          // Fallback to local storage
          const savedLogo = localStorage.getItem('storeViz_logoUrl');
          if (savedLogo) {
              setLogoUrl(savedLogo);
          }
      }
    };
    loadSettings();
  }, []);

  // -- Auto-Scroll Effect when Category is selected --
  useEffect(() => {
    if (selectedCategory) {
      const node = itemRefs.current.get(selectedCategory);
      if (node) {
        node.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' // Center the item in the list
        });
      }
    }
  }, [selectedCategory]);

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
  
  const handleLogoChange = (url: string) => {
      setLogoUrl(url);
      localStorage.setItem('storeViz_logoUrl', url);
  };
  
  const handleLogoBlur = () => {
      // Save to Firebase when user finishes typing (onBlur)
      saveLogoUrlToFirebase(logoUrl);
  };
  
  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordInput === '198') {
          setIsAuthenticated(true);
          setAuthError(false);
      } else {
          setAuthError(true);
          setPasswordInput('');
      }
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

  const addNewSheet = () => {
    if (!newSheetUrl.trim()) return;
    
    const finalName = newSheetName.trim() || `Sheet ${sheets.length + 1}`;
    
    const newSheets = [...sheets, { 
        url: newSheetUrl.trim(), 
        name: finalName,
        lastModified: Date.now()
    }];
    
    handleConfigChange(newSheets);
    setNewSheetName('');
    setNewSheetUrl('');
  };

  const updateSheet = (index: number, field: keyof SheetConfig, value: string) => {
    const newSheets = [...sheets];
    newSheets[index] = { 
        ...newSheets[index], 
        [field]: value,
        lastModified: Date.now() // Update timestamp on edit
    };
    handleConfigChange(newSheets);
  };

  const removeSheet = (index: number) => {
    const newSheets = sheets.filter((_, i) => i !== index);
    const finalSheets = newSheets; // Allow empty
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

  const getDateKey = (date: Date, view: 'daily' | 'monthly' | 'yearly') => {
      if (view === 'daily') return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (view === 'monthly') return `${date.getFullYear()}-${date.getMonth()}`;
      return `${date.getFullYear()}`;
  };

  // Date Parsing helper for Sorting
  const parseDateFromSheetName = (name: string): number => {
      // Look for patterns like DD/MM/YYYY, DD-MM-YYYY
      const match = name.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (match) {
          let year = parseInt(match[3], 10);
          const month = parseInt(match[2], 10) - 1;
          const day = parseInt(match[1], 10);
          
          // Basic check for Buddhist Year (Thai year > 2400)
          if (year > 2400) year -= 543;
          
          return new Date(year, month, day).getTime();
      }
      return 0; // No date found
  };

  const sortedSheetIndices = useMemo(() => {
    return sheets.map((s, i) => ({ ...s, originalIndex: i }))
      .sort((a, b) => {
         if (sortMode === 'modified') {
             return (b.lastModified || 0) - (a.lastModified || 0);
         }
         
         const dateA = parseDateFromSheetName(a.name);
         const dateB = parseDateFromSheetName(b.name);
         
         if (dateA === 0 && dateB === 0) return 0;
         if (dateA === 0) return 1; // Put non-dates at bottom
         if (dateB === 0) return -1;

         return sortMode === 'dateDesc' 
            ? dateB - dateA 
            : dateA - dateB;
      });
  }, [sheets, sortMode]);


  // 1. Base Filtered Transactions (Filtered by Sheet ONLY)
  // This is used as the "Universe" for the charts before they apply their specific filters
  const sheetFilteredTransactions = useMemo(() => {
    let tx = transactions;
    if (selectedSheetIndex !== null) {
      tx = tx.filter(t => t.sheetSourceIndex === selectedSheetIndex);
    }
    return tx;
  }, [transactions, selectedSheetIndex]);

  // 2. Transactions Filtered by Time (For Pie Chart)
  // Pie Chart needs to know "What is the category breakdown for THIS selected month?"
  const timeFilteredTransactions = useMemo(() => {
      if (!selectedDateKey) return sheetFilteredTransactions;

      return sheetFilteredTransactions.filter(t => {
          const dateObj = new Date(t.date);
          if (isNaN(dateObj.getTime())) return false;
          const key = getDateKey(dateObj, trendView);
          return key === selectedDateKey;
      });
  }, [sheetFilteredTransactions, selectedDateKey, trendView]);

  // 3. Fully Filtered Transactions (For List & Stats)
  // This is the most specific data: Selected Sheet + Selected Time + Selected Category
  const fullyFilteredTransactions = useMemo(() => {
      let tx = timeFilteredTransactions;
      if (selectedCategory) {
          tx = tx.filter(t => (t.category || 'อื่นๆ') === selectedCategory);
      }
      return tx;
  }, [timeFilteredTransactions, selectedCategory]);

  // --- Derived Data for UI ---

  // Sheet Summaries (Sidebar/Cards)
  const sheetSummaries = useMemo(() => {
    return sheets.map((sheet, index) => {
       // Start with ALL transactions for this sheet
       const sheetTx = transactions.filter(t => t.sheetSourceIndex === index);
       
       // Filter based on currently active global filters (Category & Time)
       const matchingTx = sheetTx.filter(t => {
           let match = true;
           if (selectedCategory) match = match && (t.category || 'อื่นๆ') === selectedCategory;
           if (selectedDateKey) {
               const d = new Date(t.date);
               if (!isNaN(d.getTime())) {
                   match = match && getDateKey(d, trendView) === selectedDateKey;
               } else {
                   match = false;
               }
           }
           return match;
       });

       const total = matchingTx.reduce((sum, t) => sum + t.amount, 0);
       
       return {
         ...sheet,
         total,
         count: matchingTx.length,
         index,
         hasMatch: matchingTx.length > 0 
       };
    });
  }, [sheets, transactions, selectedCategory, selectedDateKey, trendView]);

  // Overall Total (Displayed in Blue Card)
  const totalExpense = useMemo(() => {
     return fullyFilteredTransactions.reduce((acc, curr) => acc + curr.amount, 0);
  }, [fullyFilteredTransactions]);

  // Category Data for Pie Chart (Source: TimeFiltered)
  const categoryData = useMemo(() => {
    const summary: Record<string, number> = {};
    timeFilteredTransactions.forEach(t => {
      const cat = t.category || 'อื่นๆ';
      summary[cat] = (summary[cat] || 0) + t.amount;
    });
    return Object.keys(summary).map(key => ({
      name: key,
      value: summary[key]
    })).sort((a, b) => b.value - a.value);
  }, [timeFilteredTransactions]);

  // Trend Data for Bar Chart (Source: SheetFiltered + Category Filter)
  // We DO NOT filter by Date here, because we want to see ALL bars to click on them.
  const trendData = useMemo(() => {
    // If a category is selected, we only show trend for that category.
    const sourceTransactions = selectedCategory 
        ? sheetFilteredTransactions.filter(t => (t.category || 'อื่นๆ') === selectedCategory)
        : sheetFilteredTransactions;

    // Map key -> { date, amount, sortKey, rawKey }
    const summary = new Map<string, { date: string, amount: number, sortKey: number, rawKey: string }>();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    sourceTransactions.forEach(t => {
      const dateObj = new Date(t.date);
      if (isNaN(dateObj.getTime())) return;

      let key = '';
      let displayLabel = '';
      let sortKey = 0;

      if (trendView === 'daily') {
         // Format: DD/MM/YY
         const day = dateObj.getDate().toString().padStart(2, '0');
         const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
         const yearBE = (dateObj.getFullYear() + 543).toString().slice(-2);
         // Key matches logic in getDateKey
         key = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
         displayLabel = `${day}/${month}/${yearBE}`;
         sortKey = dateObj.getTime();
      } else if (trendView === 'monthly') {
         // Format: MMM YY (Thai)
         const monthIdx = dateObj.getMonth();
         const yearBE = (dateObj.getFullYear() + 543).toString().slice(-2);
         key = `${dateObj.getFullYear()}-${monthIdx}`;
         displayLabel = `${thaiMonths[monthIdx]} ${yearBE}`;
         // Sort by 1st of month
         sortKey = new Date(dateObj.getFullYear(), monthIdx, 1).getTime();
      } else if (trendView === 'yearly') {
         // Format: YYYY (Thai)
         const yearBE = dateObj.getFullYear() + 543;
         key = `${dateObj.getFullYear()}`;
         displayLabel = `${yearBE}`;
         sortKey = new Date(dateObj.getFullYear(), 0, 1).getTime();
      }

      if (!summary.has(key)) {
         summary.set(key, { date: displayLabel, amount: 0, sortKey, rawKey: key });
      }
      summary.get(key)!.amount += t.amount;
    });
    
    // Convert Map to Array and Sort by Time (Oldest -> Newest)
    return Array.from(summary.values())
        .sort((a, b) => a.sortKey - b.sortKey);

  }, [sheetFilteredTransactions, selectedCategory, trendView]);

  const topCategory = categoryData.length > 0 ? categoryData[0] : { name: '-', value: 0 };

  const handleTrendViewChange = (view: 'daily' | 'monthly' | 'yearly') => {
      setTrendView(view);
      setSelectedDateKey(null); // Reset date filter when changing view
  };

  const handleResetFilters = () => {
      setSelectedSheetIndex(null); 
      setSelectedCategory(null); 
      setSelectedDateKey(null);
      setSheetSearchTerm('');
  };

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
                        หมวด: {selectedCategory}
                    </span>
                )}
                {selectedDateKey && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-fade-in">
                        <Calendar size={10} />
                        ช่วงเวลาที่เลือก
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

                {(selectedSheetIndex !== null || selectedCategory !== null || selectedDateKey !== null || sheetSearchTerm !== '') && (
                <button 
                    onClick={handleResetFilters}
                    className="text-xs text-red-500 hover:underline font-medium whitespace-nowrap"
                >
                    รีเซ็ต (Reset)
                </button>
                )}
             </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                        {(selectedCategory || selectedDateKey) ? `รวมที่เลือก` : 'ภาพรวมทั้งหมด (All)'}
                    </p>
                    <h4 className={`text-lg font-bold ${selectedSheetIndex === null ? 'text-white' : 'text-gray-800'}`}>
                        {selectedCategory || selectedDateKey ? `฿${sheetSummaries.reduce((a,b)=>a+b.total, 0).toLocaleString()}` : `${sheets.length} แผ่นงาน`}
                    </h4>
                </div>
            </div>

            {sheetSummaries
                .filter(sheet => {
                    if (sheetSearchTerm.trim()) {
                        return sheet.name.toLowerCase().includes(sheetSearchTerm.toLowerCase());
                    }
                    if (selectedCategory || selectedDateKey) {
                        return sheet.hasMatch;
                    }
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
                                {selectedCategory || selectedDateKey
                                   ? `พบ ${sheet.count} รายการ`
                                   : `${sheet.count} รายการ`
                                }
                            </div>
                        </div>
                    </div>
                ))
            }

            {!selectedCategory && !selectedDateKey && !sheetSearchTerm && (
                <div className="hidden sm:flex col-span-1 lg:col-span-3 items-center justify-center p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm bg-gray-50/50">
                    <div className="text-center">
                        <p>👆 เลือกหมวดหมู่หรือช่วงเวลาจากกราฟ เพื่อกรองข้อมูล</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 pb-2 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-800 flex items-center gap-2">
             {(selectedCategory || selectedDateKey) && <Filter size={20} className="text-indigo-500" />}
             {selectedSheetIndex !== null 
                ? `วิเคราะห์: ${sheets[selectedSheetIndex]?.name || 'Sheet'}`
                : 'วิเคราะห์ภาพรวม (Overall Analysis)'}
             <div className="flex flex-wrap gap-2 items-center ml-2">
                {selectedCategory && (
                    <span className="text-sm bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                        หมวด: <b>{selectedCategory}</b>
                    </span>
                )}
                {selectedDateKey && (
                    <span className="text-sm bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md border border-orange-100">
                        ช่วงเวลา: <b>{trendData.find(d => d.rawKey === selectedDateKey)?.date || 'Selected'}</b>
                    </span>
                )}
             </div>
          </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title="ยอดรวม (Total Expense)"
          value={`฿${totalExpense.toLocaleString()}`} 
          subValue={`จาก ${fullyFilteredTransactions.length} รายการ`}
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
               fullyFilteredTransactions.length > 0 
                  ? Math.round(totalExpense / fullyFilteredTransactions.length).toLocaleString()
                  : 0
          }`}
          subValue="บาทต่อครั้ง"
          icon={<FileSpreadsheet size={24} />}
          colorClass="bg-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Daily/Monthly/Yearly Trend Chart --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
             <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                   {trendView === 'daily' && 'แนวโน้มรายวัน (Daily Trend)'}
                   {trendView === 'monthly' && 'แนวโน้มรายเดือน (Monthly Trend)'}
                   {trendView === 'yearly' && 'แนวโน้มรายปี (Yearly Trend)'}
                </h3>
                <p className="text-xs text-gray-400 font-light">
                   {selectedDateKey 
                     ? 'คลิกแท่งเดิมเพื่อยกเลิกการกรอง' 
                     : 'คลิกที่แท่งกราฟเพื่อดูรายละเอียดเฉพาะช่วงเวลานั้น'}
                </p>
             </div>

             <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => handleTrendViewChange('daily')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${trendView === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  วัน
                </button>
                <button 
                  onClick={() => handleTrendViewChange('monthly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${trendView === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  เดือน
                </button>
                <button 
                  onClick={() => handleTrendViewChange('yearly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${trendView === 'yearly' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  ปี
                </button>
             </div>
          </div>
          <div className="h-72">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                    data={trendData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tick={{fontSize: 10}} />
                  <YAxis stroke="#9CA3AF" tick={{fontSize: 12}} tickFormatter={(value) => `฿${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                  <RechartsTooltip 
                    cursor={{fill: 'transparent'}}
                    formatter={(value: number) => [`฿${value.toLocaleString()}`, 'Amount']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar 
                      dataKey="amount" 
                      radius={[4, 4, 0, 0]} 
                      barSize={trendView === 'yearly' ? 60 : 40}
                      onClick={(data) => {
                          // Ensure we use the raw data from the payload
                          if (data && data.rawKey) {
                             setSelectedDateKey(prev => prev === data.rawKey ? null : data.rawKey);
                          }
                      }}
                      cursor="pointer"
                  >
                    {trendData.map((entry, index) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={entry.rawKey === selectedDateKey ? '#F97316' : '#3B82F6'} 
                            fillOpacity={selectedDateKey && entry.rawKey !== selectedDateKey ? 0.3 : 1}
                        />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                ไม่มีข้อมูลสำหรับหมวดหมู่นี้
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">สัดส่วนค่าใช้จ่าย (By Category)</h3>
          <p className="text-xs text-gray-400 mb-2 -mt-2">
             💡 {selectedDateKey 
                  ? `แสดงสัดส่วนของช่วงเวลา: ${trendData.find(d => d.rawKey === selectedDateKey)?.date || 'Selected'}` 
                  : 'แสดงภาพรวมทั้งหมด (คลิกรายการด้านขวาเพื่อกรอง)'}
          </p>
          
          {/* UPDATED: Flex layout with custom scrollable legend */}
          <div className="h-96 sm:h-72 flex flex-col sm:flex-row gap-4 items-center">
             {/* Chart Area */}
             <div className="flex-1 w-full h-full min-h-0">
                {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                      onClick={(data) => {
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
                    {/* Removed default Legend */}
                  </PieChart>
                </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                        <AlertCircle size={24} className="mb-2 opacity-50" />
                        ไม่มีข้อมูลในช่วงเวลานี้
                    </div>
                )}
             </div>

             {/* Custom Scrollable Legend */}
             <div className="w-full sm:w-56 h-40 sm:h-full overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {categoryData.map((entry, index) => (
                    <div 
                        key={`legend-${index}`}
                        // Add ref to each item
                        ref={(el) => {
                           if (el) itemRefs.current.set(entry.name, el);
                           else itemRefs.current.delete(entry.name);
                        }}
                        onClick={() => setSelectedCategory(prev => prev === entry.name ? null : entry.name)}
                        className={`flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded-md transition-all ${
                            selectedCategory === entry.name 
                            ? 'bg-gray-100' 
                            : 'hover:bg-gray-50'
                        }`}
                    >
                        <div 
                            className="w-3 h-3 rounded-sm shrink-0" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span 
                            className={`truncate ${
                                selectedCategory === entry.name 
                                ? 'text-gray-900 font-bold' 
                                : 'text-gray-600' // Changed to match the requested gray
                            }`}
                            title={entry.name}
                        >
                            {entry.name}
                        </span>
                        <span className="text-gray-400 ml-auto text-[10px]">
                            {((entry.value / totalExpense) * 100).toFixed(0)}%
                        </span>
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLoginScreen = () => (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)] animate-fade-in p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm text-center">
           <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 shadow-inner">
              <Lock size={32} />
           </div>
           <h3 className="text-xl font-bold text-gray-800 mb-2">ยืนยันตัวตน (Admin Access)</h3>
           <p className="text-sm text-gray-500 mb-6">กรุณาใส่รหัสผ่านเพื่อจัดการข้อมูลร้านค้า</p>

           <form onSubmit={handleLogin}>
             <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className={`w-full border rounded-lg px-4 py-3 text-center text-lg mb-4 focus:outline-none focus:ring-2 transition-all ${
                    authError ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-gray-300 focus:ring-blue-500'
                }`}
                placeholder="รหัสผ่าน"
                autoFocus
                inputMode="numeric"
             />
             {authError && (
                <div className="bg-red-50 text-red-600 text-xs py-2 px-3 rounded-md mb-4 flex items-center justify-center gap-1 animate-pulse">
                    <AlertCircle size={12} /> รหัสผ่านไม่ถูกต้อง
                </div>
             )}
             <button 
                type="submit"
                className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition-colors shadow-sm active:scale-95 transform duration-150"
             >
                <div className="flex items-center justify-center gap-2">
                    <Unlock size={18} /> เข้าสู่ระบบ
                </div>
             </button>
           </form>
           <button 
             onClick={() => setActiveTab(ViewMode.DASHBOARD)}
             className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
           >
             กลับไปหน้าภาพรวม
           </button>
        </div>
    </div>
  );

  const renderImportTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-3xl mx-auto">
      <div className="text-center mb-6">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
            <Database size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800">จัดการข้อมูล Google Sheet</h3>
          <div className="mt-2 flex items-center justify-center gap-2">
             {isFirebaseConnected ? (
               <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                 <Cloud size={12} /> บันทึกบน Cloud
               </span>
             ) : (
               <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                 <CloudOff size={12} /> บันทึกในเครื่อง
               </span>
             )}
             <button 
                onClick={() => setIsAuthenticated(false)} 
                className="ml-2 text-xs text-red-500 underline hover:text-red-700"
             >
                ออกจากระบบ
             </button>
          </div>
      </div>

      {/* --- Section 0: Logo Config --- */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6 shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <ImageIcon size={16} /> ตราสัญลักษณ์ร้าน (Logo)
        </h4>
        <div className="flex gap-2 items-center">
            <div className="relative flex-1">
                <input 
                    type="text" 
                    value={logoUrl}
                    onChange={(e) => handleLogoChange(e.target.value)}
                    onBlur={handleLogoBlur}
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="วางลิงก์รูปภาพโลโก้ (https://...)..."
                />
                <LinkIcon size={14} className="absolute left-3 top-2.5 text-gray-400" />
            </div>
            {logoUrl && (
                <div className="h-10 w-10 shrink-0 border border-gray-200 rounded-md p-1 bg-gray-50 flex items-center justify-center">
                    <img src={logoUrl} alt="Preview" className="h-full w-full object-contain" />
                </div>
            )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 ml-1">
            * ใส่ URL ของรูปภาพเพื่อเปลี่ยนโลโก้ที่มุมซ้ายบน (บันทึกอัตโนมัติ)
        </p>
      </div>

      {/* --- Section 1: Add New (Single Input) --- */}
      <div className="bg-gray-50 p-5 rounded-xl border border-blue-100 mb-8 shadow-sm">
        <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-3">
            <Plus size={16} /> เพิ่มรายการใหม่ (Add New)
        </h4>
        <div className="flex flex-col md:flex-row gap-3">
             <div className="w-full md:w-1/3 space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">ชื่อชีท (เช่น 09/01/2568)</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={newSheetName}
                        onChange={(e) => setNewSheetName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="ระบุวันที่/ชื่อ..."
                    />
                    <FileText size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                </div>
             </div>
             <div className="w-full md:w-2/3 space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">ลิงก์ Google Sheet (URL)</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            value={newSheetUrl}
                            onChange={(e) => setNewSheetUrl(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            placeholder="https://docs.google.com/spreadsheets/..."
                        />
                        <LinkIcon size={16} className="absolute left-3 top-2.5 text-gray-400" />
                    </div>
                    <button 
                        onClick={addNewSheet}
                        disabled={!newSheetUrl}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        บันทึก
                    </button>
                </div>
             </div>
        </div>
      </div>

      {/* --- Section 2: Sort Toolbar --- */}
      <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-3 mb-3 pb-3 border-b border-gray-100">
         <h4 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            รายการย้อนหลัง ({sheets.length})
         </h4>
         
         <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200">
             <span className="text-xs text-gray-500 px-2 font-medium">เรียงตาม:</span>
             <button 
               onClick={() => setSortMode('dateDesc')}
               className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors ${sortMode === 'dateDesc' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}
               title="วันที่ (ปัจจุบัน -> อดีต)"
             >
                <ArrowDownWideNarrow size={14} /> ล่าสุด
             </button>
             <div className="w-px h-4 bg-gray-300 mx-1"></div>
             <button 
               onClick={() => setSortMode('dateAsc')}
               className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors ${sortMode === 'dateAsc' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}
               title="วันที่ (อดีต -> ปัจจุบัน)"
             >
                <ArrowUpNarrowWide size={14} /> เก่าสุด
             </button>
             <div className="w-px h-4 bg-gray-300 mx-1"></div>
             <button 
               onClick={() => setSortMode('modified')}
               className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors ${sortMode === 'modified' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}
               title="วันที่แก้ไขข้อมูล"
             >
                <Clock size={14} /> แก้ไข
             </button>
         </div>
      </div>

      {/* --- Section 3: List View (Sorted) --- */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {sheets.length === 0 && (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
                ยังไม่มีข้อมูล
            </div>
        )}
        
        {sortedSheetIndices.map((sheet) => {
            const originalIndex = sheet.originalIndex;
            return (
            <div key={originalIndex} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-white hover:bg-gray-50 p-3 rounded-lg border border-gray-200 transition-colors group">
              <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="bg-gray-100 text-gray-500 text-xs w-6 h-6 flex items-center justify-center rounded shrink-0 font-medium">
                      {sheets.length - originalIndex}
                  </div>
                  
                  {/* Name Input (Inline Edit) - COLOR CHANGED TO GRAY-600 */}
                  <div className="relative w-full md:w-48">
                    <input 
                        type="text" 
                        value={sheet.name}
                        onChange={(e) => updateSheet(originalIndex, 'name', e.target.value)}
                        className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 px-2 py-1 text-sm text-gray-600 focus:outline-none transition-colors"
                        placeholder="ชื่อ..."
                    />
                  </div>
              </div>

              {/* URL Input (Inline Edit) */}
              <div className="relative flex-1 w-full flex items-center gap-2">
                <LinkIcon size={14} className="text-gray-300 shrink-0" />
                <input 
                    type="text" 
                    value={sheet.url}
                    onChange={(e) => updateSheet(originalIndex, 'url', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 py-1 text-sm text-gray-500 focus:text-gray-800 focus:outline-none transition-colors truncate"
                    placeholder="URL..."
                />
              </div>

              <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <a 
                    href={sheet.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-blue-50"
                    title="เปิดลิงก์"
                  >
                     <ExternalLink size={16} />
                  </a>
                  <button 
                    onClick={() => removeSheet(originalIndex)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="ลบรายการนี้"
                  >
                    <Trash2 size={16} />
                  </button>
              </div>
            </div>
            );
        })}
      </div>
      
      {/* Bottom Actions */}
      <div className="mt-6 flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-100">
           <button 
              onClick={handleSync}
              disabled={isLoading}
              className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm font-medium"
            >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "กำลังประมวลผล..." : "รีเฟรชข้อมูลทั้งหมด (Sync All)"}
            </button>
      </div>

      {/* Import/Export Tools */}
      <div className="mt-6">
           <div className="flex gap-3 justify-center">
              <button 
                 onClick={handleExportConfig}
                 className="text-gray-500 text-xs hover:text-gray-700 flex items-center gap-1"
              >
                 <Upload size={12} />
                 Backup Config (.json)
              </button>
              
              <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="text-gray-500 text-xs hover:text-gray-700 flex items-center gap-1"
              >
                 <Download size={12} />
                 Restore Config
              </button>
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept=".json" 
                 onChange={handleImportConfig}
              />
           </div>
      </div>
      
      {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 mt-4">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:relative ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-100 justify-between md:justify-start">
          {logoUrl ? (
            <div className="flex items-center gap-2">
                <img src={logoUrl} alt="Store Logo" className="h-10 max-w-[180px] object-contain" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
                <LayoutDashboard />
                <span>StoreViz</span>
            </div>
          )}
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
           {logoUrl ? (
                <img src={logoUrl} alt="Store Logo" className="h-8 max-w-[150px] object-contain" />
           ) : (
                <h1 className="font-bold text-gray-800">StoreViz</h1>
           )}
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
              <TransactionsTable transactions={fullyFilteredTransactions} sheets={sheets} />
            )}

            {activeTab === ViewMode.IMPORT && (
                isAuthenticated ? renderImportTab() : renderLoginScreen()
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;