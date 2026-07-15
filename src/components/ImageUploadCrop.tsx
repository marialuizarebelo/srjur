import { useState, useCallback, useRef } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { supabase } from '@/integrations/supabase/client'
import { getCroppedBlob } from '@/lib/cropImage'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Upload, Loader2, ImageOff } from 'lucide-react'
import { toast } from 'sonner'

interface ImageUploadCropProps {
  value: string | null
  onChange: (url: string) => void
  bucket: string
  shape?: 'circle' | 'square'
  size?: number
  label?: string
  disabled?: boolean
}

export function ImageUploadCrop({ value, onChange, bucket, shape = 'circle', size = 96, label, disabled }: ImageUploadCropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rawImage, setRawImage] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setRawImage(reader.result as string)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function confirmCrop() {
    if (!rawImage || !croppedAreaPixels) return
    setUploading(true)
    try {
      const blob = await getCroppedBlob(rawImage, croppedAreaPixels, shape === 'circle' ? 400 : 600)
      const fileName = `${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, blob, {
        contentType: 'image/jpeg', upsert: true,
      })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
      onChange(data.publicUrl)
      toast.success('Imagem atualizada!')
      setCropOpen(false)
      setRawImage(null)
    } catch (e) {
      toast.error('Erro ao enviar imagem. Verifique se o bucket "' + bucket + '" existe no Supabase Storage.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex items-center gap-4">
        <div
          className={`flex items-center justify-center bg-muted overflow-hidden shrink-0 border border-border/60 ${
            shape === 'circle' ? 'rounded-full' : 'rounded-xl'
          }`}
          style={{ width: size, height: size }}
        >
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6 text-muted-foreground/40" />
          )}
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Enviar imagem
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5">JPG ou PNG, você poderá ajustar o enquadramento</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
      </div>

      {/* ── Crop Dialog ── */}
      <Dialog open={cropOpen} onOpenChange={o => { if (!uploading) { setCropOpen(o); if (!o) setRawImage(null) } }}>
        <DialogContent className="max-w-[480px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Ajustar imagem</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="relative w-full h-72 bg-muted rounded-xl overflow-hidden">
              {rawImage && (
                <Cropper
                  image={rawImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape={shape === 'circle' ? 'round' : 'rect'}
                  showGrid={shape !== 'circle'}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Zoom</p>
              <Slider value={[zoom]} onValueChange={v => setZoom(v[0])} min={1} max={3} step={0.05} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" disabled={uploading} />}>Cancelar</DialogClose>
            <Button onClick={confirmCrop} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {uploading ? 'Enviando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
