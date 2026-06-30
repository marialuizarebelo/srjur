interface Area { x: number; y: number; width: number; height: number }

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = url
  })
}

// Gera um Blob da área recortada da imagem, redimensionado para `outputSize`
export async function getCroppedBlob(
  imageSrc: string,
  cropPixels: Area,
  outputSize = 400,
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, outputSize, outputSize,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao gerar imagem recortada'))
    }, 'image/jpeg', 0.92)
  })
}
