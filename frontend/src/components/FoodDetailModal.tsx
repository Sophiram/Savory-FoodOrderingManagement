import { useState } from 'react';
import { type MenuItem } from '@/lib/supabase';
import { X, Clock, Plus, Minus, Utensils, Sparkles, NotebookPen } from 'lucide-react';

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, notes?: string) => void;
}

export default function FoodDetailModal({ item, onClose, onAddToCart }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');

  if (!item) return null;

  const handleAdd = () => {
    onAddToCart(item, quantity, itemNotes.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in max-h-[90vh] flex flex-col">
        {/* Image Banner */}
        <div className="relative h-56 bg-slate-100 overflow-hidden shrink-0">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Utensils className="w-16 h-16" />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-900/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {item.is_popular && (
            <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold uppercase tracking-wider shadow-md">
              <Sparkles className="w-3.5 h-3.5" /> Popular Choice
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">{item.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-orange-500" />
                  {item.preparation_time || 15} mins prep
                </span>
                <span>•</span>
                <span className={item.is_available ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                  {item.is_available ? 'Available Now' : 'Out of Stock'}
                </span>
              </div>
            </div>
            <span className="text-2xl font-black text-slate-900 shrink-0">
              ${Number(item.price).toFixed(2)}
            </span>
          </div>

          <p className="text-slate-600 text-sm leading-relaxed">
            {item.description || 'Prepared fresh with chef-selected ingredients, served hot and delicious.'}
          </p>

          {/* Item Special Instructions */}
          <div className="pt-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
              <NotebookPen className="w-3.5 h-3.5 text-orange-500" /> Special Instructions (Optional)
            </label>
            <input
              type="text"
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="e.g. Extra spicy, dressing on side, no onions"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-1 shrink-0">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-bold text-slate-900 text-sm">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={!item.is_available}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600 text-slate-950 font-bold rounded-2xl hover:shadow-lg hover:shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Add to Cart · ${(item.price * quantity).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}
