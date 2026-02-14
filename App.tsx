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
  Lock, Unlock, ChevronLeft, ChevronRight as ChevronRightIcon, Store, MapPin,
  Package, AlertTriangle, TrendingDown, Eraser, Save, Receipt, Check
} from 'lucide-react';
import { Transaction, ViewMode, SheetConfig, InventoryItem } from './types';
import { generateMockData } from './utils/mockData';
import { fetchSheetData } from './services/sheetService';
import { 
  getSheetUrlsFromFirebase, 
  saveSheetUrlsToFirebase, 
  getLogoUrlFromFirebase, 
  saveLogoUrlToFirebase,
  getStoreInfoFromFirebase,
  saveStoreInfoToFirebase,
  getInventoryFromFirebase,
  saveInventoryToFirebase,
  getUnitsFromFirebase,
  saveUnitsToFirebase
} from './services/firebaseService';
import { StatsCard } from './components/StatsCard';
import { TransactionsTable } from './components/TransactionsTable';

// Colors for charts
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#6366F1'];

// Interface for Pending Import Items
interface PendingItem {
  tempId: string;
  name: string;
  qty: string;
  unit: string;
  price: string; // Price per unit
  total: string; // Total Price
  date: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewMode>(ViewMode.DASHBOARD);
  
  // Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUsingRealData, setIsUsingRealData] = useState(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  
  // Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  // Units State (with default values)
  const [availableUnits, setAvailableUnits] = useState<string[]>(['กก.', 'กรัม', 'ขีด', 'แพ็ค', 'ถุง', 'ชิ้น', 'ลิตร', 'ขวด', 'กระป๋อง', 'กล่อง']);
  const [inventorySearchTerm, setInventorySearchTerm] = useState(''); // NEW: Inventory Search
  const [inventorySort, setInventorySort] = useState<'dateDesc' | 'dateAsc'>('dateDesc'); // NEW: Inventory Sort Order
  
  // Inventory Single Form State (Manual Entry)
  const [invName, setInvName] = useState('');
  const [invPrice, setInvPrice] = useState(''); 
  const [invTotal, setInvTotal] = useState(''); 
  const [invQty, setInvQty] = useState('');
  const [invUnit, setInvUnit] = useState('กก.'); 
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0, 10));

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSortOrder, setImportSortOrder] = useState<'newest' | 'oldest'>('newest'); // NEW: Sort for import modal
  const [importFilterDate, setImportFilterDate] = useState(''); // NEW: Date filter for import modal
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set()); // NEW: Multi-select state
  
  // Pending Items State (For Bulk Edit Mode)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

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
  
  // -- NEW STATE for Custom Logo & Store Info --
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('StoreViz');
  const [branchName, setBranchName] = useState<string>('');
  
  // -- AUTH STATE --
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  
  // Refs for scrolling logic
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Initialize state with default valid URL and Name
  const [sheets, setSheets] = useState<SheetConfig[]>([
    { url: 'https://docs.google.com/spreadsheets/d/1ZJ01yx27FMzBDKdXAF3e1Gy9s6HokAC4FsO6BESzi_w/edit#gid=0', name: 'ข้อมูลตัวอย่าง (Main)', lastModified: Date.now() }
  ]);
  
  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inventoryFileInputRef = useRef<HTMLInputElement>(null); // NEW: For inventory restore
  const importDateInputRef = useRef<HTMLInputElement>(null); // NEW: Ref for date filter input

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

      // 3. Load Store Info
      const remoteInfo = await getStoreInfoFromFirebase();
      if (remoteInfo) {
          setStoreName(remoteInfo.name || 'StoreViz');
          setBranchName(remoteInfo.branch || '');
      } else {
          const savedInfo = localStorage.getItem('storeViz_info');
          if (savedInfo) {
              const parsed = JSON.parse(savedInfo);
              setStoreName(parsed.name || 'StoreViz');
              setBranchName(parsed.branch || '');
          }
      }
      
      // 4. Load Inventory
      const remoteInventory = await getInventoryFromFirebase();
      if (remoteInventory) {
          setInventory(remoteInventory);
      }

      // 5. Load Custom Units
      const remoteUnits = await getUnitsFromFirebase();
      if (remoteUnits && Array.isArray(remoteUnits)) {
          setAvailableUnits(remoteUnits);
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
      saveLogoUrlToFirebase(logoUrl);
  };

  const handleStoreInfoSave = () => {
      localStorage.setItem('storeViz_info', JSON.stringify({ name: storeName, branch: branchName }));
      saveStoreInfoToFirebase(storeName, branchName);
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
      // Filter out empty strings AND keep original index
      const validItems = sheetsToFetch
        .map((s, i) => ({ ...s, originalIndex: i }))
        .filter(s => s.url.trim() !== '');
      
      if (validItems.length === 0) {
        setTransactions(generateMockData());
        setIsUsingRealData(false);
        setIsLoading(false);
        return;
      }

      // --- Batch Fetching to avoid 429 Too Many Requests ---
      const results: Transaction[][] = [];
      const BATCH_SIZE = 3; // Fetch 3 sheets at a time

      for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
          const batch = validItems.slice(i, i + BATCH_SIZE);
          
          const batchPromises = batch.map(item => 
              fetchSheetData(item.url, item.originalIndex, item.name)
          );
          
          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults);

          // Add delay if there are more items to fetch
          if (i + BATCH_SIZE < validItems.length) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
          }
      }
      
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
  
  // -- INVENTORY LOGIC --
  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === 'ADD_NEW') {
          const newUnit = window.prompt("ระบุชื่อหน่วยใหม่ (เช่น ตะกร้า, ลัง, ถาด):");
          if (newUnit && newUnit.trim()) {
              const trimmed = newUnit.trim();
              if (!availableUnits.includes(trimmed)) {
                  const updatedUnits = [...availableUnits, trimmed];
                  setAvailableUnits(updatedUnits);
                  saveUnitsToFirebase(updatedUnits);
                  setInvUnit(trimmed); // Select the new unit
              } else {
                  setInvUnit(trimmed);
              }
          } else {
              // User cancelled or empty
              // setInvUnit(availableUnits[0]); // Don't change or reset
          }
      } else {
          setInvUnit(val);
      }
  };

  const handleClearSingleForm = () => {
      setInvName('');
      setInvPrice('');
      setInvTotal(''); 
      setInvQty('');
  };

  // NEW: Import Logic - Single Selection (Legacy support)
  const handleImportTransaction = (tx: Transaction) => {
      setInvName(tx.description || 'ไม่ระบุชื่อ');
      setInvDate(tx.date.slice(0, 10)); // YYYY-MM-DD
      setInvTotal(tx.amount.toString());
      setInvQty(''); // User must verify qty
      setInvPrice(''); // Recalculated based on qty
      setIsImportModalOpen(false);
  };

  // NEW: Batch Import Logic (Bulk Edit)
  const toggleImportSelection = (id: string) => {
      const newSet = new Set(selectedImportIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedImportIds(newSet);
  };

  const handleBatchImport = () => {
      if (selectedImportIds.size === 0) return;
      
      const selectedTxs = transactions.filter(tx => selectedImportIds.has(tx.id));
      
      if (selectedTxs.length > 0) {
          // Convert to PendingItems
          const newPendingItems: PendingItem[] = selectedTxs.map(tx => ({
              tempId: Date.now() + Math.random().toString(36).substr(2, 5),
              name: tx.description || 'ไม่ระบุชื่อ',
              qty: '', // User needs to fill
              unit: availableUnits[0],
              total: tx.amount.toString(),
              price: '', // Will be calc from Total / Qty
              date: tx.date.slice(0, 10)
          }));
          setPendingItems(newPendingItems);
          // alert(`นำเข้า ${newPendingItems.length} รายการสำหรับแก้ไข`);
      }

      setSelectedImportIds(new Set());
      setIsImportModalOpen(false);
  };

  // --- Bulk Edit Logic ---
  const updatePendingItem = (index: number, field: keyof PendingItem, value: string) => {
      const newItems = [...pendingItems];
      const item = { ...newItems[index], [field]: value };

      // Auto-calc logic specific to this item
      const qty = parseFloat(item.qty);
      const total = parseFloat(item.total);
      const price = parseFloat(item.price);

      if (field === 'qty') {
          if (!isNaN(qty) && qty > 0) {
               // If total exists but price doesn't (or we just changed qty), calc price
               if (total > 0 && (isNaN(price) || price === 0 || item.price === '')) {
                   item.price = (total / qty).toFixed(2);
               } 
               // If price exists, calc total (Standard behavior)
               else if (price > 0) {
                   item.total = (price * qty).toFixed(2);
               }
          }
      } else if (field === 'price') {
          if (!isNaN(qty) && !isNaN(parseFloat(value))) {
              item.total = (parseFloat(value) * qty).toFixed(2);
          }
      } else if (field === 'total') {
          if (!isNaN(qty) && qty > 0 && !isNaN(parseFloat(value))) {
              item.price = (parseFloat(value) / qty).toFixed(2);
          }
      }

      newItems[index] = item;
      setPendingItems(newItems);
  };

  const removePendingItem = (index: number) => {
      const newItems = pendingItems.filter((_, i) => i !== index);
      setPendingItems(newItems);
  };

  const saveAllPendingItems = () => {
      const validItems: InventoryItem[] = [];
      const invalidIndices: number[] = [];

      pendingItems.forEach((p, idx) => {
          const qty = parseFloat(p.qty);
          const price = parseFloat(p.price);
          const total = parseFloat(p.total);

          // Validation
          if (!p.name || isNaN(qty) || qty <= 0 || (isNaN(price) && isNaN(total))) {
              invalidIndices.push(idx);
              return;
          }

          // Final Check Calc
          let finalPrice = price;
          let finalTotal = total;
          if ((isNaN(finalPrice) || finalPrice <= 0) && finalTotal > 0 && qty > 0) {
              finalPrice = finalTotal / qty;
          }
          if ((isNaN(finalTotal) || finalTotal <= 0) && finalPrice > 0 && qty > 0) {
              finalTotal = finalPrice * qty;
          }

          // Price Analysis Logic (Simplified)
          const historyItems = inventory.filter(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
          let status: 'normal' | 'expensive' | 'cheap' = 'normal';
          let priceDiffPercent = 0;
          if (historyItems.length > 0) {
                const avgPrice = historyItems.reduce((sum, item) => sum + item.pricePerUnit, 0) / historyItems.length;
                priceDiffPercent = ((finalPrice - avgPrice) / avgPrice) * 100;
                if (priceDiffPercent > 15) status = 'expensive';
                else if (priceDiffPercent < -15) status = 'cheap';
          }

          validItems.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 5) + idx,
              name: p.name,
              quantity: qty,
              unit: p.unit,
              pricePerUnit: finalPrice,
              totalPrice: finalTotal,
              date: p.date,
              status,
              priceDiffPercent
          });
      });

      if (validItems.length > 0) {
          const newInventory = [...validItems, ...inventory];
          setInventory(newInventory);
          saveInventoryToFirebase(newInventory);
          
          if (invalidIndices.length > 0) {
              alert(`บันทึกสำเร็จ ${validItems.length} รายการ\nเหลือ ${invalidIndices.length} รายการที่ข้อมูลไม่ครบถ้วน`);
              // Keep invalid items
              setPendingItems(pendingItems.filter((_, i) => invalidIndices.includes(i)));
          } else {
              setPendingItems([]); // Clear all
          }
      } else {
          alert("กรุณากรอกข้อมูล จำนวน และ ราคา ให้ครบถ้วน");
      }
  };

  // --- Single Form Logic (Existing) ---
  const handleInvQtyChange = (val: string) => {
      setInvQty(val);
      const qty = parseFloat(val);
      const total = parseFloat(invTotal);
      const price = parseFloat(invPrice);

      if (!isNaN(qty) && qty > 0) {
          if (total > 0 && (isNaN(price) || price === 0 || invPrice === '')) {
              setInvPrice((total / qty).toFixed(2));
          } else if (price > 0) {
              setInvTotal((price * qty).toFixed(2));
          }
      }
  };

  const handleInvPriceChange = (val: string) => {
      setInvPrice(val);
      const price = parseFloat(val);
      const qty = parseFloat(invQty);
      if (!isNaN(price) && !isNaN(qty)) {
          setInvTotal((price * qty).toFixed(2));
      }
  };

  const handleInvTotalChange = (val: string) => {
      setInvTotal(val);
      const total = parseFloat(val);
      const qty = parseFloat(invQty);
      if (!isNaN(total) && !isNaN(qty) && qty > 0) {
          setInvPrice((total / qty).toFixed(2));
      }
  };

  const handleAddInventory = () => {
      // Allow saving if we have Name, Qty, and either Price/Unit OR Total
      if (!invName || !invQty) {
          alert("กรุณากรอกชื่อและจำนวน");
          return;
      }

      let currentPrice = parseFloat(invPrice);
      const quantity = parseFloat(invQty);
      const currentTotal = parseFloat(invTotal);

      // If Price/Unit is missing but Total is there, calculate it
      if ((isNaN(currentPrice) || currentPrice === 0) && !isNaN(currentTotal) && quantity > 0) {
          currentPrice = currentTotal / quantity;
      }

      if (isNaN(currentPrice) || currentPrice <= 0) {
          alert("กรุณาระบุราคา หรือ ราคารวมให้ถูกต้อง");
          return;
      }
      
      const historyItems = inventory.filter(item => item.name.toLowerCase().trim() === invName.toLowerCase().trim());
      let status: 'normal' | 'expensive' | 'cheap' = 'normal';
      let priceDiffPercent = 0;

      if (historyItems.length > 0) {
          const avgPrice = historyItems.reduce((sum, item) => sum + item.pricePerUnit, 0) / historyItems.length;
          priceDiffPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
          if (priceDiffPercent > 15) {
              status = 'expensive';
              alert(`⚠️ แจ้งเตือน: ราคา "${invName}" สูงกว่าปกติ ${priceDiffPercent.toFixed(1)}% (เฉลี่ย ฿${avgPrice.toFixed(2)})`);
          } else if (priceDiffPercent < -15) {
              status = 'cheap';
          }
      }

      const newItem: InventoryItem = {
          id: Date.now().toString(),
          name: invName,
          pricePerUnit: currentPrice,
          quantity: quantity,
          unit: invUnit || availableUnits[0],
          date: invDate,
          totalPrice: currentPrice * quantity, 
          status,
          priceDiffPercent
      };

      const newInventory = [newItem, ...inventory];
      setInventory(newInventory);
      saveInventoryToFirebase(newInventory);

      handleClearSingleForm();
  };

  const removeInventoryItem = (id: string) => {
      if (window.confirm("คุณต้องการลบรายการนี้ใช่หรือไม่? (การกระทำนี้ไม่สามารถย้อนกลับได้)")) {
          const newInventory = inventory.filter(item => item.id !== id);
          setInventory(newInventory);
          saveInventoryToFirebase(newInventory);
      }
  };

  // --- NEW: Refresh Analysis Logic ---
  const handleRefreshAnalysis = () => {
    if (inventory.length === 0) return;
    
    // 1. Calculate stats per item name (Group by Name)
    const statsMap = new Map<string, { total: number, count: number }>();
    
    inventory.forEach(item => {
        const key = item.name.trim().toLowerCase();
        const current = statsMap.get(key) || { total: 0, count: 0 };
        statsMap.set(key, { total: current.total + item.pricePerUnit, count: current.count + 1 });
    });

    // 2. Update items with new averages
    const updatedInventory = inventory.map(item => {
        const key = item.name.trim().toLowerCase();
        const stats = statsMap.get(key);
        
        if (!stats || stats.count === 0) return item;

        const avgPrice = stats.total / stats.count;
        
        let status: 'normal' | 'expensive' | 'cheap' = 'normal';
        let priceDiffPercent = 0;

        if (avgPrice > 0) {
            priceDiffPercent = ((item.pricePerUnit - avgPrice) / avgPrice) * 100;
            if (priceDiffPercent > 15) status = 'expensive';
            else if (priceDiffPercent < -15) status = 'cheap';
        }

        return { ...item, status, priceDiffPercent };
    });

    setInventory(updatedInventory);
    saveInventoryToFirebase(updatedInventory);
    alert("รีเฟรชการวิเคราะห์ราคาเรียบร้อย (Prices Re-analyzed based on full history)");
  };

  // --- NEW: Inventory Backup/Restore Logic ---
  const handleExportInventory = () => {
    const dataStr = JSON.stringify(inventory, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportInventory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed)) {
             if (window.confirm(`พบข้อมูลวัตถุดิบ ${parsed.length} รายการ ต้องการนำเข้าแทนที่ข้อมูลปัจจุบันหรือไม่?`)) {
                setInventory(parsed);
                saveInventoryToFirebase(parsed);
                alert("นำเข้าข้อมูลสำเร็จ!");
             }
          } else {
              alert("รูปแบบไฟล์ไม่ถูกต้อง (ต้องเป็น JSON Array)");
          }
        }
      } catch (err) {
        alert("เกิดข้อผิดพลาดในการอ่านไฟล์");
      }
    };
    reader.readAsText(file);
    if (inventoryFileInputRef.current) inventoryFileInputRef.current.value = '';
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

  // Helper function to scroll the sheet list
  const scrollSheets = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
        const scrollAmount = 300; // Scroll width of roughly one card
        scrollContainerRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    }
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

  // NEW Calculation: Count unique months in the filtered view for "Avg/Month"
  const uniqueMonthsCount = useMemo(() => {
    if (fullyFilteredTransactions.length === 0) return 1;
    const uniqueMonths = new Set();
    fullyFilteredTransactions.forEach(t => {
         const d = new Date(t.date);
         if (!isNaN(d.getTime())) {
             // Create a key like "2023-5" to represent a unique month-year combo
             uniqueMonths.add(`${d.getFullYear()}-${d.getMonth()}`);
         }
    });
    return uniqueMonths.size || 1;
  }, [fullyFilteredTransactions]);

  const avgPerMonth = totalExpense / uniqueMonthsCount;
  const avgPerBill = fullyFilteredTransactions.length > 0 ? totalExpense / fullyFilteredTransactions.length : 0;

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
      
      {/* --- Sheet Cards (Sticky "Total" + Horizontal Scroll) --- */}
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
                
                {/* Scroll Buttons */}
                <div className="flex gap-1">
                    <button onClick={() => scrollSheets('left')} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={() => scrollSheets('right')} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                        <ChevronRightIcon size={18} />
                    </button>
                </div>
             </div>
        </div>

        {/* --- STICKY LAYOUT --- */}
        <div className="flex gap-4 items-start">
            {/* 1. STICKY: Total Card */}
            <div className="shrink-0 z-10">
                <div 
                    onClick={() => setSelectedSheetIndex(null)}
                    className={`
                        w-[220px] p-4 rounded-xl border cursor-pointer transition-all duration-200 group h-full flex flex-col justify-between
                        ${selectedSheetIndex === null 
                            ? 'bg-blue-600 border-blue-600 shadow-lg transform scale-[1.02] ring-2 ring-blue-200' 
                            : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md'
                        }
                    `}
                    style={{ minHeight: '130px' }}
                >
                    <div className="flex justify-between items-start">
                        <div className={`p-2 rounded-lg ${selectedSheetIndex === null ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                            <LayoutDashboard size={20} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className={`text-sm font-medium ${selectedSheetIndex === null ? 'text-blue-100' : 'text-gray-500'}`}>
                            {(selectedCategory || selectedDateKey) ? `รวมที่เลือก` : 'ภาพรวมทั้งหมด'}
                        </p>
                        <h4 className={`text-xl font-bold truncate ${selectedSheetIndex === null ? 'text-white' : 'text-gray-800'}`}>
                            {selectedCategory || selectedDateKey ? `฿${sheetSummaries.reduce((a,b)=>a+b.total, 0).toLocaleString()}` : `${sheets.length} แผ่นงาน`}
                        </h4>
                    </div>
                </div>
            </div>

            {/* 2. SCROLLABLE: Sheet List */}
            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-x-auto pb-4 -mb-4 snap-x cursor-grab active:cursor-grabbing scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <div className="flex gap-4">
                    {sheetSummaries
                        .filter(sheet => {
                            if (sheetSearchTerm.trim()) {
                                return sheet.name.toLowerCase().includes(sheetSearchTerm.toLowerCase());
                            }
                            if (selectedCategory || selectedDateKey) {
                                return sheet.hasMatch;
                            }
                            return true; 
                        })
                        .map((sheet) => (
                            <div 
                                key={sheet.index}
                                onClick={() => setSelectedSheetIndex(sheet.index)}
                                className={`
                                    min-w-[220px] max-w-[220px] relative p-4 rounded-xl border cursor-pointer transition-all duration-200 group snap-start flex flex-col justify-between
                                    ${selectedSheetIndex === sheet.index
                                        ? 'bg-emerald-600 border-emerald-600 shadow-md transform scale-[1.02] z-10' 
                                        : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-sm'
                                    }
                                `}
                                style={{ minHeight: '130px' }}
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
                                    <p className={`text-sm font-medium truncate pr-2 ${selectedSheetIndex === sheet.index ? 'text-emerald-100' : 'text-gray-500'}`} title={sheet.name}>
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
                </div>
            </div>
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
                        ช่วงเวลา: <b>{trendData.find(d => d.rawKey === selectedDateKey)?.date || 'Selected'}`</b>
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
        {/* CHANGED: From Avg/Bill to Avg/Month (Dynamic) */}
        <StatsCard 
          title="เฉลี่ยรายเดือน (Avg/Month)" 
          value={`฿${Math.round(avgPerMonth).toLocaleString()}`}
          subValue={`เฉลี่ยต่อบิล: ฿${Math.round(avgPerBill).toLocaleString()}`}
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
  
  const renderInventoryTab = () => {
    // Filter Inventory based on Search Term and Sort
    const filteredInventory = inventory
        .filter(item => item.name.toLowerCase().includes(inventorySearchTerm.toLowerCase()))
        .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            
            if (inventorySort === 'dateDesc') {
                // Newest first (Descending)
                return dateB - dateA;
            } else {
                // Oldest first (Ascending)
                return dateA - dateB;
            }
        });

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 w-full mx-auto relative">
        {/* Import Modal */}
        {isImportModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                        <div className="flex items-center gap-2 text-indigo-700">
                             <Receipt size={20} />
                             {/* CHANGED: Text updated */}
                             <h3 className="font-bold">ดึงข้อมูลจากไฟล์ (Import from Data Source)</h3>
                        </div>
                        <button onClick={() => setIsImportModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                    
                    {/* CHANGED: Toolbar for Filtering and Sorting */}
                    <div className="p-3 bg-blue-50 text-blue-800 text-xs border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                             <List size={14} /> 
                             <span className="font-semibold">แสดงรายการทั้งหมด (All Transactions)</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                             {/* Date Filter */}
                             <div className="relative flex items-center">
                                <Calendar 
                                    size={14} 
                                    className="absolute left-2 text-blue-400 cursor-pointer hover:text-blue-600 z-10"
                                    onClick={() => {
                                        try {
                                            if (importDateInputRef.current) {
                                                (importDateInputRef.current as any).showPicker();
                                            }
                                        } catch(e) {
                                            importDateInputRef.current?.focus();
                                        }
                                    }} 
                                />
                                <input 
                                    ref={importDateInputRef}
                                    type="date"
                                    value={importFilterDate}
                                    onChange={(e) => setImportFilterDate(e.target.value)}
                                    className="pl-7 pr-2 py-1.5 border border-blue-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white cursor-pointer"
                                    onClick={(e) => {
                                        try {
                                            (e.target as any).showPicker();
                                        } catch(e) {}
                                    }}
                                />
                                {importFilterDate && (
                                    <button 
                                        onClick={() => setImportFilterDate('')}
                                        className="ml-1 text-blue-400 hover:text-red-500"
                                        title="ล้างตัวกรองวันที่"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                             </div>
                             
                             {/* Sort Button */}
                             <button 
                                onClick={() => setImportSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                                title={importSortOrder === 'newest' ? 'เรียงจาก ใหม่ -> เก่า' : 'เรียงจาก เก่า -> ใหม่'}
                             >
                                {importSortOrder === 'newest' ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
                                <span className="font-medium hidden sm:inline">{importSortOrder === 'newest' ? 'ล่าสุด' : 'เก่าสุด'}</span>
                             </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {transactions
                            // CHANGED: Filter by Date if selected
                            .filter(tx => {
                                if (importFilterDate) {
                                    // tx.date is ISO string YYYY-MM-DD...
                                    return tx.date.startsWith(importFilterDate);
                                }
                                return true;
                            })
                            // CHANGED: Sort based on state
                            .sort((a, b) => {
                                const timeA = new Date(a.date).getTime();
                                const timeB = new Date(b.date).getTime();
                                return importSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
                            })
                            .map((tx) => (
                                <div 
                                    key={tx.id} 
                                    onClick={() => toggleImportSelection(tx.id)}
                                    className={`p-3 border rounded-lg transition-colors flex justify-between items-center group cursor-pointer ${
                                        selectedImportIds.has(tx.id) 
                                        ? 'bg-indigo-50 border-indigo-300' 
                                        : 'border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{tx.displayDate}</span>
                                            {/* ADDED: Source Name Display */}
                                            {tx.sourceName && (
                                                <span className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-[100px]" title={tx.sourceName}>
                                                    {tx.sourceName}
                                                </span>
                                            )}
                                            <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 truncate max-w-[150px]">{tx.category}</span>
                                        </div>
                                        <div className="font-medium text-gray-800 truncate" title={tx.description}>
                                            {tx.description}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <span className="font-bold text-gray-800">฿{tx.amount.toLocaleString()}</span>
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleImportTransaction(tx);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 text-xs font-bold rounded-md hover:bg-indigo-50 transition-all shadow-sm"
                                            >
                                                เลือก
                                            </button>
                                            <div 
                                                className={`w-6 h-6 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                                                    selectedImportIds.has(tx.id) 
                                                    ? 'bg-indigo-600 border-indigo-600' 
                                                    : 'bg-white border-gray-300 hover:border-indigo-400'
                                                }`}
                                                onClick={() => toggleImportSelection(tx.id)}
                                            >
                                                {selectedImportIds.has(tx.id) && <Check size={14} className="text-white" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        }
                        {transactions.filter(tx => !importFilterDate || tx.date.startsWith(importFilterDate)).length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                {importFilterDate ? "ไม่พบรายการในวันที่เลือก" : "ไม่พบข้อมูลรายการใน Data Source"}
                            </div>
                        )}
                    </div>

                    {/* Footer for Batch Import */}
                    {selectedImportIds.size > 0 && (
                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center animate-fade-in">
                            <span className="text-sm font-semibold text-indigo-800">
                                เลือกแล้ว {selectedImportIds.size} รายการ
                            </span>
                            <button 
                                onClick={handleBatchImport}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-md transition-transform active:scale-95 flex items-center gap-2"
                            >
                                <Download size={16} /> นำเข้า ({selectedImportIds.size})
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-600">
            <Package size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800">จัดการสต็อกวัตถุดิบ (Raw Materials)</h3>
          <p className="text-gray-500 text-sm mt-1">บันทึกราคาและตรวจสอบความเปลี่ยนแปลง</p>
        </div>

        {/* Input Form (Swaps between Single and Bulk Mode) */}
        {pendingItems.length > 0 ? (
            // --- BULK EDIT MODE ---
            <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-200 mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                        <List size={16} /> รายการที่รอตรวจสอบ ({pendingItems.length} รายการ)
                    </h4>
                    <button 
                       onClick={() => setIsImportModalOpen(true)}
                       className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm"
                   >
                       <Plus size={14} /> เพิ่มรายการ
                   </button>
                </div>

                <div className="space-y-3">
                    {pendingItems.map((item, idx) => (
                        <div key={item.tempId} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm relative group">
                            {/* Remove Button */}
                            <button 
                                onClick={() => removePendingItem(idx)}
                                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-colors"
                            >
                                <X size={16} />
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                {/* Name */}
                                <div className="md:col-span-4 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold ml-1">ชื่อวัตถุดิบ</label>
                                    <input 
                                        type="text" 
                                        value={item.name}
                                        onChange={(e) => updatePendingItem(idx, 'name', e.target.value)}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                
                                {/* Date */}
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold ml-1">วันที่</label>
                                    <input 
                                        type="date" 
                                        value={item.date}
                                        onChange={(e) => updatePendingItem(idx, 'date', e.target.value)}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                </div>

                                {/* Qty & Unit */}
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold ml-1">จำนวน</label>
                                    <div className="flex gap-1">
                                        <input 
                                            type="number" 
                                            value={item.qty}
                                            onChange={(e) => updatePendingItem(idx, 'qty', e.target.value)}
                                            placeholder="0"
                                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                        />
                                        <select 
                                            value={item.unit}
                                            onChange={(e) => updatePendingItem(idx, 'unit', e.target.value)}
                                            className="w-16 border border-gray-300 rounded px-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        >
                                            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Total Price */}
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold ml-1">ราคารวม</label>
                                    <input 
                                        type="number" 
                                        value={item.total}
                                        onChange={(e) => updatePendingItem(idx, 'total', e.target.value)}
                                        placeholder="฿"
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-medium text-gray-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                </div>

                                {/* Unit Price */}
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold ml-1">ราคา/หน่วย</label>
                                    <input 
                                        type="number" 
                                        value={item.price}
                                        onChange={(e) => updatePendingItem(idx, 'price', e.target.value)}
                                        placeholder="Auto"
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-500 bg-gray-50 focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 mt-5 pt-3 border-t border-indigo-100">
                    <button 
                        onClick={() => {
                            if(window.confirm("ยกเลิกการนำเข้าทั้งหมด?")) setPendingItems([]);
                        }}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        ยกเลิก (Cancel)
                    </button>
                    <button 
                        onClick={saveAllPendingItems}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <Save size={18} /> บันทึกทั้งหมด ({pendingItems.length})
                    </button>
                </div>
            </div>
        ) : (
            // --- STANDARD SINGLE FORM ---
            <div className="bg-gray-50 p-5 rounded-xl border border-indigo-100 mb-8 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start mb-3">
                <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                        <Plus size={16} /> บันทึกการซื้อ (New Entry)
                </h4>
                <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm"
                >
                    <Receipt size={14} /> ดึงข้อมูลจากไฟล์ (Import)
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Name */}
                <div className="space-y-1 col-span-2 lg:col-span-2">
                    <label className="text-xs text-gray-500 font-medium ml-1">ชื่อวัตถุดิบ</label>
                    <input 
                        type="text" 
                        value={invName}
                        onChange={(e) => setInvName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        placeholder="เช่น เนื้อหมู, ไข่ไก่..."
                    />
                </div>

                {/* Quantity */}
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium ml-1">จำนวน (Qty)</label>
                    <div className="flex gap-1">
                        <input 
                            type="number" 
                            value={invQty}
                            onChange={(e) => handleInvQtyChange(e.target.value)}
                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            placeholder="0"
                        />
                        <select 
                            value={invUnit}
                            onChange={handleUnitChange}
                            className="w-20 border border-gray-300 rounded-lg px-1 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-center cursor-pointer"
                        >
                            {availableUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                            <option value="ADD_NEW" className="font-bold text-indigo-600 bg-indigo-50">
                                +
                            </option>
                        </select>
                    </div>
                </div>
                
                {/* NEW: Total Price */}
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium ml-1 flex items-center justify-between">
                        ราคารวม (Total)
                        {invTotal && invQty && parseFloat(invQty) > 0 && (
                            <span className="text-[10px] text-green-600 font-normal">Auto-calc</span>
                        )}
                    </label>
                    <input 
                        type="number" 
                        value={invTotal}
                        onChange={(e) => handleInvTotalChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-gray-800"
                        placeholder="฿ รวม"
                    />
                </div>

                {/* Unit Price (Auto Calc) */}
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium ml-1">ราคา/หน่วย</label>
                    <input 
                        type="number" 
                        value={invPrice}
                        onChange={(e) => handleInvPriceChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-600"
                        placeholder="฿/หน่วย"
                    />
                </div>
            </div>
            
            <div className="mt-3">
                <label className="text-xs text-gray-500 font-medium ml-1">วันที่</label>
                    <input 
                        type="date" 
                        value={invDate}
                        onChange={(e) => setInvDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
            </div>
            
            <div className="flex gap-3 mt-4">
                <button 
                    onClick={handleClearSingleForm}
                    className="px-6 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                    title="ล้างข้อมูลในฟอร์ม"
                >
                    <Eraser size={16} /> ล้างค่า
                </button>
                <button 
                    onClick={handleAddInventory}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    บันทึกข้อมูล
                </button>
            </div>
            </div>
        )}

        {/* Search & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pt-4 border-t border-gray-100">
             <h4 className="text-sm font-bold text-gray-700 whitespace-nowrap">
                ประวัติการซื้อล่าสุด ({filteredInventory.length})
             </h4>
             
             <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text"
                        value={inventorySearchTerm}
                        onChange={(e) => setInventorySearchTerm(e.target.value)}
                        placeholder="ค้นหาชื่อวัตถุดิบ..."
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-white"
                    />
                    {inventorySearchTerm && (
                        <button 
                            onClick={() => setInventorySearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    {/* NEW: Sort Button */}
                    <button 
                        onClick={() => setInventorySort(prev => prev === 'dateDesc' ? 'dateAsc' : 'dateDesc')}
                        className="text-xs flex items-center gap-1 text-gray-600 hover:text-indigo-600 border border-gray-200 bg-white px-3 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap justify-center font-medium"
                        title={inventorySort === 'dateDesc' ? 'เรียงจากปัจจุบัน -> อดีต' : 'เรียงจากอดีต -> ปัจจุบัน'}
                    >
                        {inventorySort === 'dateDesc' ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
                        {inventorySort === 'dateDesc' ? 'ล่าสุด' : 'เก่าสุด'}
                    </button>

                    <button 
                        onClick={handleRefreshAnalysis}
                        className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-indigo-50 px-3 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap justify-center font-medium"
                        title="คำนวณราคาเปรียบเทียบใหม่จากประวัติทั้งหมด"
                    >
                        <RefreshCw size={14} /> รีเฟรชราคา
                    </button>
                    <button 
                        onClick={handleExportInventory} 
                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-600 border border-gray-200 px-3 py-2 rounded-md bg-white shadow-sm transition-colors whitespace-nowrap justify-center"
                        title="ดาวน์โหลดไฟล์สำรองข้อมูล (.json)"
                    >
                        <Upload size={14} /> Backup
                    </button>
                    <button 
                        onClick={() => inventoryFileInputRef.current?.click()} 
                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-600 border border-gray-200 px-3 py-2 rounded-md bg-white shadow-sm transition-colors whitespace-nowrap justify-center"
                        title="นำเข้าไฟล์สำรองข้อมูล"
                    >
                        <Download size={14} /> Restore
                    </button>
                    <input 
                        type="file" 
                        ref={inventoryFileInputRef} 
                        className="hidden" 
                        accept=".json" 
                        onChange={handleImportInventory} 
                    />
                </div>
             </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 rounded-l-lg">วันที่</th>
                        <th className="px-4 py-3">รายการ</th>
                        <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
                        <th className="px-4 py-3 text-center">จำนวน</th>
                        <th className="px-4 py-3 text-right">รวม</th>
                        <th className="px-4 py-3 text-center rounded-r-lg">สถานะราคา</th>
                        <th className="px-2 py-3"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredInventory.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors text-sm">
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                {new Date(item.date).toLocaleDateString('th-TH')}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                            <td className="px-4 py-3 text-right">฿{item.pricePerUnit.toLocaleString()}</td>
                            <td className="px-4 py-3 text-center">{item.quantity} {item.unit}</td>
                            <td className="px-4 py-3 text-right font-semibold">฿{item.totalPrice.toLocaleString()}</td>
                            <td className="px-4 py-3 text-center">
                                {item.status === 'expensive' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                                        <AlertTriangle size={10} /> 
                                        +{item.priceDiffPercent?.toFixed(0)}%
                                    </span>
                                )}
                                {item.status === 'cheap' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">
                                        <TrendingDown size={10} />
                                        {item.priceDiffPercent?.toFixed(0)}%
                                    </span>
                                )}
                                {item.status === 'normal' && (
                                    <span className="text-gray-400 text-[10px]">-</span>
                                )}
                            </td>
                            <td className="px-2 py-3 text-right">
                                <button 
                                    onClick={() => removeInventoryItem(item.id)} 
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="ลบรายการนี้"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filteredInventory.length === 0 && (
                        <tr>
                            <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                                {inventorySearchTerm ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีข้อมูลวัตถุดิบ"}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    );
  };

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

      {/* --- Section 0: Store Identity Config --- */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6 shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Store size={16} /> ข้อมูลร้านค้า (Store Identity)
        </h4>
        
        {/* Logo Input */}
        <div className="flex gap-2 items-center mb-3">
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
        
        {/* Name & Branch Input */}
        <div className="flex flex-col md:flex-row gap-3">
             <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-500 ml-1">ชื่อร้าน (Store Name)</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        onBlur={handleStoreInfoSave}
                        className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="ชื่อร้าน..."
                    />
                    <Store size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                </div>
             </div>
             <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-500 ml-1">สาขา (Branch)</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        onBlur={handleStoreInfoSave}
                        className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="เช่น สาขาใหญ่, สาขา 2..."
                    />
                    <MapPin size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                </div>
             </div>
        </div>
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
        <div className="h-20 flex items-center px-6 border-b border-gray-100 justify-between md:justify-start">
          <div className="flex items-center gap-3">
             {logoUrl ? (
                <img src={logoUrl} alt="Store Logo" className="h-12 w-auto max-w-[60px] object-contain rounded-md" />
             ) : (
                <div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <LayoutDashboard size={24} />
                </div>
             )}
             <div className="flex flex-col">
                 <h1 className="font-bold text-gray-800 text-base leading-tight">
                    {storeName || 'StoreViz'}
                 </h1>
                 {branchName && (
                     <span className="text-xs text-gray-400 font-medium">
                        {branchName}
                     </span>
                 )}
             </div>
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
           <button 
            onClick={() => { setActiveTab(ViewMode.INVENTORY); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === ViewMode.INVENTORY ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Package size={18} />
            วัตถุดิบ (Raw Materials)
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
           <div className="flex items-center gap-2">
                {logoUrl ? (
                        <img src={logoUrl} alt="Store Logo" className="h-10 w-auto object-contain rounded-sm" />
                ) : (
                        <LayoutDashboard size={24} className="text-indigo-600" />
                )}
                <div className="flex flex-col">
                     <span className="font-bold text-gray-800 text-sm">{storeName}</span>
                     {branchName && <span className="text-[10px] text-gray-500 leading-none">{branchName}</span>}
                </div>
           </div>
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
                  {activeTab === ViewMode.INVENTORY && 'คลังวัตถุดิบ (Inventory)'}
                </h1>
                <p className="text-gray-500 mt-1">
                  {isUsingRealData 
                    ? `รวมข้อมูลจริงจาก ${sheets.filter(s=>s.url).length} แผ่นงาน (${transactions.length} รายการ)` 
                    : 'ข้อมูลจำลอง (Demo Mode)'}
                </p>
              </div>
              {activeTab !== ViewMode.IMPORT && activeTab !== ViewMode.INVENTORY && (
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
            
            {activeTab === ViewMode.INVENTORY && (
                isAuthenticated ? renderInventoryTab() : renderLoginScreen()
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;