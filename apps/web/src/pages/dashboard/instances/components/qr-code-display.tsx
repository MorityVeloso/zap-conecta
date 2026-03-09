import { useState, useEffect, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'

const QR_EXPIRY_SECONDS = 45

export function QrCodeDisplay({ data, generatedAt }: { data: string; generatedAt: number }) {
  const [remaining, setRemaining] = useState(QR_EXPIRY_SECONDS)

  useEffect(() => {
    const elapsed = Math.floor((Date.now() - generatedAt) / 1000)
    setRemaining(Math.max(0, QR_EXPIRY_SECONDS - elapsed))

    const timer = setInterval(() => {
      const now = Math.floor((Date.now() - generatedAt) / 1000)
      const left = Math.max(0, QR_EXPIRY_SECONDS - now)
      setRemaining(left)
      if (left <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [generatedAt])

  const expired = remaining <= 0

  const isBase64Image = data.startsWith('data:image') || data.length > 100
  if (isBase64Image) {
    const src = data.startsWith('data:') ? data : `data:image/png;base64,${data}`
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`bg-white p-4 rounded-xl shadow-inner relative ${expired ? 'opacity-30' : ''}`}>
          <img src={src} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
          {expired && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background/90 text-foreground font-semibold text-sm px-3 py-1.5 rounded-lg">
                QR expirado
              </span>
            </div>
          )}
        </div>
        {!expired && (
          <p className="text-xs text-muted-foreground text-center">
            Expira em <span className="font-mono font-medium text-foreground">{remaining}s</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground text-center max-w-[220px]">
          Abra o WhatsApp &rarr; Dispositivos vinculados &rarr; Adicionar dispositivo
        </p>
      </div>
    )
  }
  return (
    <div className="font-mono text-xs text-muted-foreground break-all bg-muted p-3 rounded-lg max-h-40 overflow-auto">
      {data}
    </div>
  )
}

export function PairingCodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const formatted = code.replace(/(.{4})(.{4})/, '$1-$2')

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 mt-3">
      <span className="text-xs text-muted-foreground">Código:</span>
      <span className="font-mono font-bold text-lg tracking-widest text-foreground">{formatted}</span>
      <button
        onClick={copy}
        className="ml-1 p-1 rounded hover:bg-background transition-colors"
        aria-label="Copiar código"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  )
}
