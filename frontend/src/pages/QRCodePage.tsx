import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode, Copy, Download, Printer, RefreshCw, Check, Link as LinkIcon,
} from 'lucide-react';

export default function QRCodePage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use the current window location to build the ordering URL
  const baseUrl = window.location.origin;
  const orderUrl = `${baseUrl}/order`;

  const generateQR = async () => {
    try {
      // Generate at high resolution for printing
      const dataUrl = await QRCode.toDataURL(orderUrl, {
        width: 512,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });
      setQrDataUrl(dataUrl);

      // Also draw to canvas for display
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, 256, 256);
          };
          img.src = dataUrl;
        }
      }
    } catch (err) {
      console.error('QR generation error:', err);
    }
  };

  useEffect(() => {
    generateQR();
  }, [orderUrl]);

  const handleRegenerate = () => {
    setRegenerating(true);
    setTimeout(() => {
      generateQR();
      setRegenerating(false);
    }, 500);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = orderUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = 'savory-qr-code.png';
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Savory — QR Code Ordering</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #f8fafc;
          }
          .card {
            background: white;
            border-radius: 24px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            padding: 48px;
            text-align: center;
            max-width: 400px;
          }
          .badge {
            display: inline-block;
            background: linear-gradient(135deg, #f59e0b, #f97316);
            color: white;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 6px 16px;
            border-radius: 20px;
            margin-bottom: 16px;
          }
          h1 { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
          .subtitle { font-size: 14px; color: #64748b; margin-bottom: 24px; }
          .qr { margin: 0 auto 24px; display: block; width: 280px; height: 280px; }
          .url { font-size: 12px; color: #94a3b8; word-break: break-all; }
          @media print {
            body { background: white; }
            .card { box-shadow: none; border: 1px solid #e2e8f0; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">QR CODE ORDERING</div>
          <h1>Scan to Order from Home</h1>
          <p class="subtitle">Point your camera at the code to open our menu</p>
          <img src="${qrDataUrl}" class="qr" alt="QR Code" />
          <p class="url">${orderUrl}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-900">QR Code Ordering</h2>
        <p className="text-sm text-slate-500 mt-0.5">Generate a QR code for customers to scan and order from home</p>
      </div>

      {/* QR Code Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="inline-block bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full">
              QR Code Ordering
            </div>
          </div>
          <h3 className="text-white text-lg font-bold mt-3">Scan to Order from Home</h3>
          <p className="text-slate-400 text-sm mt-1">Customers scan this code to open your menu and place an order</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center">
            {/* QR Code display */}
            <div className="relative w-64 h-64 bg-white border-2 border-slate-200 rounded-2xl p-4 flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" className="w-full h-full" />
              ) : (
                <div className="w-8 h-8 border-2 border-slate-300 border-t-amber-500 rounded-full animate-spin" />
              )}
              {regenerating && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl">
                  <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              )}
            </div>
            <canvas ref={canvasRef} width={256} height={256} className="hidden" />

            {/* URL */}
            <div className="mt-6 w-full max-w-md">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">Customer Ordering Link</label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{orderUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-6 justify-center">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                Copy Link
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download QR
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print QR
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
            <QrCode className="w-5 h-5 text-amber-600" />
          </div>
          <h4 className="text-sm font-semibold text-slate-900">How it works</h4>
          <p className="text-xs text-slate-500 mt-1">Customers scan the QR code with their phone camera to open your menu instantly — no app needed.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
            <LinkIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <h4 className="text-sm font-semibold text-slate-900">Share the link</h4>
          <p className="text-xs text-slate-500 mt-1">Copy the ordering link to share via social media, email, or your website.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center mb-3">
            <Printer className="w-5 h-5 text-sky-600" />
          </div>
          <h4 className="text-sm font-semibold text-slate-900">Print ready</h4>
          <p className="text-xs text-slate-500 mt-1">Download or print the QR code at high resolution for table tents, flyers, or posters.</p>
        </div>
      </div>
    </div>
  );
}
