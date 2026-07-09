'use client';

import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { db } from '@/lib/storage';
import { GlassItem } from '@/types';
import styles from './inventory.module.css';
import ItemModal from '@/components/inventory/ItemModal';
import BreakageModal from '@/components/inventory/BreakageModal';
import ItemHistoryModal from '@/components/inventory/ItemHistoryModal';

import { generateUUID, formatInchesToFraction, formatIndianCurrency } from '@/lib/utils';

export default function InventoryPage() {
    const [items, setItems] = useState<GlassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [topSellingItems, setTopSellingItems] = useState<Array<{ name: string; quantity: number }>>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBreakageModalOpen, setIsBreakageModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const [editingItem, setEditingItem] = useState<GlassItem | undefined>(undefined);
    const [selectedItemForHistory, setSelectedItemForHistory] = useState<GlassItem | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'glass' | 'hardware'>('all');

    const [filters, setFilters] = useState({
        category: 'all',
        name: '',
        make: '',
        type: '',
        dimensions: '',
        thickness: '',
        stock: '',
        avgCost: ''
    });

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        setLoading(true);
        const [itemsData, invoicesData] = await Promise.all([
            db.items.getAll(),
            db.invoices.getAll()
        ]);
        
        setItems(itemsData);

        // Calculate top selling items from sale invoices
        const salesMap: Record<string, number> = {};
        invoicesData.filter(inv => inv.type === 'sale').forEach(inv => {
            inv.items?.forEach(item => {
                const name = item.itemName || item.description;
                if (name) {
                    salesMap[name] = (salesMap[name] || 0) + (item.quantity || 0);
                }
            });
        });
        const sortedSales = Object.entries(salesMap)
            .map(([name, qty]) => ({ name, quantity: qty }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 3);
        setTopSellingItems(sortedSales);

        setLoading(false);
    };

    const handleSaveItem = async (itemData: Omit<GlassItem, 'id'>) => {
        // Check for duplicates
        const getItemKey = (item: Partial<GlassItem>) => {
            if (item.category === 'hardware') {
                return `hardware-${item.name}-${item.make || ''}-${item.model || ''}`.toLowerCase();
            }
            return `glass-${item.name}-${item.type}-${item.thickness}-${item.width}-${item.height}`.toLowerCase();
        };

        const newKey = getItemKey(itemData);
        const isDuplicate = items.some(existingItem => {
            if (editingItem && existingItem.id === editingItem.id) return false; // Ignore self when editing
            return getItemKey(existingItem) === newKey;
        });

        if (isDuplicate) {
            alert('An item with these details already exists in the inventory.');
            return;
        }

        if (editingItem) {
            // Update existing
            const updatedItem = { ...itemData, id: editingItem.id };
            await db.items.update(updatedItem);
        } else {
            // Add new
            const newItem: GlassItem = {
                ...itemData,
                id: generateUUID(),
            };
            await db.items.add(newItem);
        }
        await loadItems();
        setEditingItem(undefined);
        setIsModalOpen(false);
        alert('Item saved successfully!');
    };

    const handleEditClick = (item: GlassItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setEditingItem(undefined);
        setIsModalOpen(false);
    };

    const handleBreakageSaved = async () => {
        await loadItems();
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = !search ||
            (item.name || '').toLowerCase().includes(search.toLowerCase()) ||
            (item.type || '').toLowerCase().includes(search.toLowerCase()) ||
            ((item.make || '').toLowerCase().includes(search.toLowerCase()));

        const matchesCategoryTab = categoryFilter === 'all' || 
            (categoryFilter === 'glass' && item.category !== 'hardware') || 
            (categoryFilter === 'hardware' && item.category === 'hardware');

        const matchesColCategory = filters.category === 'all' ||
            (filters.category === 'glass' && item.category !== 'hardware') ||
            (filters.category === 'hardware' && item.category === 'hardware');

        const matchesColName = !filters.name ||
            (item.name || '').toLowerCase().includes(filters.name.toLowerCase());

        const matchesColMake = !filters.make ||
            (item.make || '').toLowerCase().includes(filters.make.toLowerCase());

        const matchesColType = !filters.type ||
            (item.type || '').toLowerCase().includes(filters.type.toLowerCase());

        const dimsString = item.category === 'hardware'
            ? (item.model || '')
            : (item.width && item.height) ? `${item.width} x ${item.height}` : '';
        const matchesColDimensions = !filters.dimensions ||
            dimsString.toLowerCase().includes(filters.dimensions.toLowerCase());

        const thicknessString = item.category === 'hardware' ? '' : `${item.thickness || 0}`;
        const matchesColThickness = !filters.thickness ||
            thicknessString.toLowerCase().includes(filters.thickness.toLowerCase());

        const stockString = `${item.stock || 0}`;
        const matchesColStock = !filters.stock ||
            stockString.toLowerCase().includes(filters.stock.toLowerCase());

        const costString = `${item.purchaseRate || 0}`;
        const matchesColAvgCost = !filters.avgCost ||
            costString.toLowerCase().includes(filters.avgCost.toLowerCase());

        return matchesSearch && matchesCategoryTab && matchesColCategory && matchesColName && matchesColMake && matchesColType && matchesColDimensions && matchesColThickness && matchesColStock && matchesColAvgCost;
    });

    const totalItems = items.length;
    const lowStockCount = items.filter(item => {
        const stock = Number(item.stock) || 0;
        const minStock = Number(item.minStock) || 0;
        return minStock > 0 && stock < minStock;
    }).length;

    const hasActiveFilters = search !== '' ||
        categoryFilter !== 'all' ||
        filters.category !== 'all' ||
        filters.name !== '' ||
        filters.make !== '' ||
        filters.type !== '' ||
        filters.dimensions !== '' ||
        filters.thickness !== '' ||
        filters.stock !== '' ||
        filters.avgCost !== '';

    const filteredLowStockCount = filteredItems.filter(item => {
        const stock = Number(item.stock) || 0;
        const minStock = Number(item.minStock) || 0;
        return minStock > 0 && stock < minStock;
    }).length;

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    // Reset current page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, categoryFilter, filters]);

    const totalFiltered = filteredItems.length;
    const totalPages = Math.ceil(totalFiltered / pageSize);
    const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="container">
            <div className={styles.header}>
                <h1 className={styles.title}>Inventory Management</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn" style={{ background: '#fee2e2', color: '#ef4444', border: 'none' }} onClick={() => setIsBreakageModalOpen(true)}>
                        Record Breakage
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add New Item
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid var(--color-primary)' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Total Items</span>
                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text)' }}>
                        {hasActiveFilters ? `${filteredItems.length} / ${totalItems}` : totalItems}
                        {hasActiveFilters && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                                filtered
                            </span>
                        )}
                    </span>
                </div>
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #ef4444' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Low Stock Alert</span>
                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
                        {hasActiveFilters ? `${filteredLowStockCount} / ${lowStockCount}` : `${lowStockCount} Items`}
                        {hasActiveFilters && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                                filtered
                            </span>
                        )}
                    </span>
                </div>
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #f59e0b' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Maximum Selling Items</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                        {topSellingItems.length > 0 ? (
                            topSellingItems.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.name}>
                                        {idx + 1}. {item.name}
                                    </span>
                                    <strong style={{ marginLeft: '0.5rem' }}>{item.quantity} sold</strong>
                                </div>
                            ))
                        ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No sales recorded yet</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="card">
                {/* Category Filtering Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem 1.5rem 0 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <button 
                        className={`btn ${categoryFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={() => setCategoryFilter('all')}
                    >
                        All Items
                    </button>
                    <button 
                        className={`btn ${categoryFilter === 'glass' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={() => setCategoryFilter('glass')}
                    >
                        Glass
                    </button>
                    <button 
                        className={`btn ${categoryFilter === 'hardware' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={() => setCategoryFilter('hardware')}
                    >
                        Hardware
                    </button>
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.searchWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search items..."
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading inventory...</div>
                ) : (
                    <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Item Name</th>
                                <th>Make</th>
                                <th>Type</th>
                                <th>Dimensions / Model</th>
                                <th>Thickness</th>
                                <th>Stock</th>
                                <th>Shop</th>
                                <th>Avg Cost</th>
                                <th>Actions</th>
                            </tr>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <select
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '80px' }}
                                        value={filters.category}
                                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                                    >
                                        <option value="all">All</option>
                                        <option value="glass">Glass</option>
                                        <option value="hardware">Hardware</option>
                                    </select>
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Name..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '100px' }}
                                        value={filters.name}
                                        onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Make..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '80px' }}
                                        value={filters.make}
                                        onChange={(e) => setFilters({ ...filters, make: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Type..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '80px' }}
                                        value={filters.type}
                                        onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Size..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '80px' }}
                                        value={filters.dimensions}
                                        onChange={(e) => setFilters({ ...filters, dimensions: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Thickness..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '70px' }}
                                        value={filters.thickness}
                                        onChange={(e) => setFilters({ ...filters, thickness: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Stock..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '70px' }}
                                        value={filters.stock}
                                        onChange={(e) => setFilters({ ...filters, stock: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    Online
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter Cost..."
                                        className="input"
                                        style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', width: '100%', minWidth: '70px' }}
                                        value={filters.avgCost}
                                        onChange={(e) => setFilters({ ...filters, avgCost: e.target.value })}
                                    />
                                </th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: '100%', height: 'auto' }}
                                        onClick={() => setFilters({
                                            category: 'all',
                                            name: '',
                                            make: '',
                                            type: '',
                                            dimensions: '',
                                            thickness: '',
                                            stock: '',
                                            avgCost: ''
                                        })}
                                    >
                                        Clear
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedItems.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            background: item.category === 'hardware' ? '#e0e7ff' : '#ecfdf5',
                                            color: item.category === 'hardware' ? '#4338ca' : '#047857',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {item.category === 'hardware' ? 'Hardware' : 'Glass'}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                                    <td>{item.make || '-'}</td>
                                    <td>{item.type}</td>
                                    <td>
                                        {item.category === 'hardware' ? (
                                            <span style={{ color: 'var(--color-text-muted)' }}>
                                                {item.model || '-'}
                                            </span>
                                        ) : (
                                            (item.width && item.height) ? `${formatInchesToFraction(item.width)}" x ${formatInchesToFraction(item.height)}"` : 'Custom / Variable'
                                        )}
                                    </td>
                                    <td>
                                        {item.category === 'hardware' ? '-' : `${item.thickness || 0}mm`}
                                    </td>
                                    <td>
                                        {renderStockDetails(item)}
                                    </td>
                                    <td>
                                        <div style={{ display: 'grid', gap: '0.25rem' }}>
                                            <span style={{
                                                width: 'fit-content',
                                                padding: '0.2rem 0.45rem',
                                                borderRadius: '999px',
                                                background: item.showOnline ? '#dcfce7' : '#fee2e2',
                                                color: item.showOnline ? '#047857' : '#b91c1c',
                                                fontSize: '0.7rem',
                                                fontWeight: 700
                                            }}>
                                                {item.showOnline ? 'Online' : 'Hidden'}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', color: item.imageUrl ? '#047857' : 'var(--color-text-muted)' }}>
                                                {item.imageUrl ? 'Image added' : 'No image'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{formatIndianCurrency(item.purchaseRate || 0)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#e0e7ff', color: '#4338ca', border: 'none' }}
                                                onClick={() => {
                                                    setSelectedItemForHistory(item);
                                                    setIsHistoryModalOpen(true);
                                                }}
                                            >
                                                History
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => handleEditClick(item)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none' }}
                                                onClick={async () => {
                                                    if (confirm('Are you sure you want to delete this item?')) {
                                                        try {
                                                            await db.items.delete(item.id);
                                                            await loadItems();
                                                        } catch (e: any) {
                                                            alert('Failed to delete item. It might be used in invoices.');
                                                            console.error(e);
                                                        }
                                                    }
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                )}
                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', background: '#f8fafc' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} entries
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            >
                                Previous
                            </button>
                            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ItemModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveItem}
                onDelete={async (id) => {
                    try {
                        await db.items.delete(id);
                        await loadItems();
                        alert('Item deleted successfully.');
                    } catch (e: any) {
                        alert('Failed to delete item. It might be used in invoices.');
                        console.error(e);
                    }
                }}
                initialData={editingItem}
            />

            <BreakageModal
                isOpen={isBreakageModalOpen}
                onClose={() => setIsBreakageModalOpen(false)}
                onSave={handleBreakageSaved}
            />

            <ItemHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                item={selectedItemForHistory}
            />
        </div>
    );
}

function renderStockDetails(item: GlassItem) {
    if (item.category === 'hardware') {
        const stock = item.stock || 0;
        const wA = item.warehouseStock?.['Warehouse A'] || 0;
        const wB = item.warehouseStock?.['Warehouse B'] || 0;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '999px',
                    background: (item.minStock || 0) > 0 && stock < item.minStock! ? '#fee2e2' : '#dcfce7',
                    color: (item.minStock || 0) > 0 && stock < item.minStock! ? '#ef4444' : '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    width: 'fit-content'
                }}>
                    {stock} Nos
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    Warehouse A: {wA} Nos | Warehouse B: {wB} Nos
                </span>
            </div>
        );
    }

    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    const stock = Number(item.stock) || 0;
    const unit = item.unit || 'sqft';
    const wA = Number(item.warehouseStock?.['Warehouse A']) || 0;
    const wB = Number(item.warehouseStock?.['Warehouse B']) || 0;

    const sheetAreaSqft = (width * height) / 144;

    // Convert total stock
    let totalSqft = 0;
    let totalSheets = 0;

    if (unit === 'sheets') {
        totalSheets = stock;
        totalSqft = sheetAreaSqft > 0 ? stock * sheetAreaSqft : 0;
    } else if (unit === 'sqft') {
        totalSqft = stock;
        totalSheets = sheetAreaSqft > 0 ? stock / sheetAreaSqft : 0;
    } else {
        totalSheets = stock;
        totalSqft = sheetAreaSqft > 0 ? stock * sheetAreaSqft : 0;
    }

    // Convert Warehouse A
    let wASqft = 0;
    let wASheets = 0;
    if (unit === 'sheets') {
        wASheets = wA;
        wASqft = sheetAreaSqft > 0 ? wA * sheetAreaSqft : 0;
    } else {
        wASqft = wA;
        wASheets = sheetAreaSqft > 0 ? wA / sheetAreaSqft : 0;
    }

    // Convert Warehouse B
    let wBSqft = 0;
    let wBSheets = 0;
    if (unit === 'sheets') {
        wBSheets = wB;
        wBSqft = sheetAreaSqft > 0 ? wB * sheetAreaSqft : 0;
    } else {
        wBSqft = wB;
        wBSheets = sheetAreaSqft > 0 ? wB / sheetAreaSqft : 0;
    }

    const sqm = totalSqft * 0.092903;
    const sqmm = totalSqft * 92903.04;

    const isLow = (item.minStock || 0) > 0 && stock < item.minStock!;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.3 }}>
            {/* Primary Stock (Entered Unit) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '999px',
                    background: isLow ? '#fee2e2' : '#dcfce7',
                    color: isLow ? '#ef4444' : '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    width: 'fit-content'
                }}>
                    {stock} {unit === 'sqft' ? 'Sq. Ft' : 'Sheets'}
                </span>
            </div>

            {/* Warehouse Breakdown */}
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                Warehouse A: {wA} {unit === 'sqft' ? 'Sq. Ft' : 'Sheets'} ({wASheets.toFixed(2)} sheets / {wASqft.toFixed(2)} sqft)
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                Warehouse B: {wB} {unit === 'sqft' ? 'Sq. Ft' : 'Sheets'} ({wBSheets.toFixed(2)} sheets / {wBSqft.toFixed(2)} sqft)
            </span>

            {/* Glass Units Conversions */}
            {width > 0 && height > 0 ? (
                <div style={{ 
                    marginTop: '2px', 
                    padding: '4px 6px', 
                    background: '#f8fafc', 
                    borderRadius: '6px', 
                    border: '1px solid #e2e8f0',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px',
                    fontSize: '0.72rem',
                    width: 'fit-content'
                }}>
                    <div style={{ color: '#475569' }}>
                        📄 <strong>Sheets:</strong> {totalSheets.toFixed(2)}
                    </div>
                    <div style={{ color: '#475569' }}>
                        📐 <strong>Sq. Ft:</strong> {totalSqft.toFixed(2)}
                    </div>
                    <div style={{ color: '#475569' }}>
                        🌍 <strong>Sq. M:</strong> {sqm.toFixed(4)}
                    </div>
                    <div style={{ color: '#475569' }}>
                        📏 <strong>Sq. MM:</strong> {sqmm.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                    * Conversions unavailable for Custom/Variable sizes
                </div>
            )}
        </div>
    );
}
