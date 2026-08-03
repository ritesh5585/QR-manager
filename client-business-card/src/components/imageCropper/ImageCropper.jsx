import { useState, useRef, useEffect } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import { canvasPreview } from './canvasPreview';
import { useDebounceEffect } from './useDebounceEffect';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from "react-hot-toast";
import { PiScissorsFill } from "react-icons/pi";
import { CiCrop } from "react-icons/ci";
import CachedImage from '../CachedImage';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export default function ImageCropper({profileImage, onCropComplete}) {
  const [previousImg, setPreviousImg] = useState(null);
  const [imgSrc, setImgSrc] = useState('');
  const previewCanvasRef = useRef(null);
  const imgRef = useRef(null);
  const hiddenAnchorRef = useRef(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [isCropped, setIsCropped] = useState(false);

  useEffect(() => {
    if (profileImage) {
      setPreviousImg(profileImage);
    }
  }, [profileImage]);

  function onSelectFile(e) {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined);
      setIsCropped(false); // Reset crop state when new image is selected
      const reader = new FileReader();
      reader.addEventListener('load', () =>
        setImgSrc(reader.result?.toString() || '')
      );
      reader.readAsDataURL(e.target.files[0]);
    }
  }

  function onImageLoad(e) {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }

  const handleCancelCrop = () => {
    setImgSrc(null);
    setCrop({ aspect: 1 });
    setCompletedCrop(null);
    setIsCropped(false);
    onCropComplete(null);
  };

  async function handleCropConfirm(e) {
    e.preventDefault();
    e.stopPropagation();
    const image = imgRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!image || !previewCanvas || !completedCrop) {
      toast.error('Please select a crop area', {id: "crop-error"});
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const offscreen = new OffscreenCanvas(
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      toast.error('Failed to process image', {id: "ctx-error"});
      return;
    }

    ctx.drawImage(
      previewCanvas,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height,
      0,
      0,
      offscreen.width,
      offscreen.height
    );

    try {
      const blob = await offscreen.convertToBlob({ type: 'image/png' });
      if (blob) {
        onCropComplete(blob);
        setIsCropped(true); // Mark as cropped
        toast.success('Image cropped successfully', {id: "success"});
      } else {
        throw new Error('Failed to generate blob');
      }
    } catch (error) {
      toast.error('Failed to crop image', {id: "crop-failed"});
    }
  }

  useDebounceEffect(
    async () => {
      if (
        completedCrop?.width &&
        completedCrop?.height &&
        imgRef.current &&
        previewCanvasRef.current
      ) {
        canvasPreview(
          imgRef.current,
          previewCanvasRef.current,
          completedCrop,
          scale,
          rotate
        );
      }
    },
    100,
    [completedCrop, scale, rotate]
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* show the uploaded image in case of editing the form while the status is assigned */}
      {previousImg &&
        <div className='flex flex-col items-center justify-center gap-2'>
          <div className='w-full flex flex-col items-center justify-center rounded-xl border-1'>
            <CachedImage imageKey={previousImg} className="max-h-[200px] sm:max-h-[300px] object-contain" />
          </div>
          <div>
            <button
              onClick={() => setPreviousImg(null)}
              className="whitespace-nowrap cursor-pointer w-full px-2 py-1 sm:px-4 sm:py-2 bg-blue-600 text-sm sm:text-sm text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"  
            >
              Change Image
            </button>
          </div>
        </div>
      }
      {!previousImg && (!imgSrc ? (
        <div className="flex flex-col items-center">
          <label className="w-full max-w-xs">
            <div className="flex flex-col items-center justify-center px-4 py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors">
              <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <span className="text-sm font-medium text-gray-700">Choose an image</span>
              <span className="text-xs text-gray-500 mt-1">PNG, JPG, JPEG up to 10MB</span>
              <input
                type="file"
                accept="image/*"
                onChange={onSelectFile}
                className="hidden"
              />
            </div>
          </label>
        </div>
      ) : (
        <div className="space-y-6">
          {/* First Row: Cropper and Preview */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
            <div className="border border-gray-200 rounded-lg overflow-hidden flex justify-center">
              {isCropped ? (
                <img
                  src={previewCanvasRef.current?.toDataURL()}
                  alt="Cropped result"
                  className="max-h-[200px] sm:max-h-[300px] object-contain"
                />
              ) : (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  className="max-h-[200px] sm:max-h-[300px]"
                  disabled={isCropped} // Disable crop interaction after crop
                >
                  <img
                    ref={imgRef}
                    alt="Crop me"
                    src={imgSrc}
                    style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                    onLoad={onImageLoad}
                    className="w-full"
                  />
                </ReactCrop>
              )}
            </div>

            <div className="sm:flex flex-col items-center justify-center hidden">
              {!!completedCrop && (
                <div className="relative w-full h-full max-h-[400px]">
                  <canvas
                    ref={previewCanvasRef}
                    className="border border-gray-200 rounded-lg w-full h-full object-contain"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-center py-1 text-xs">
                    Preview
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Second Row: Controls - Only show if not cropped */}
          {!isCropped && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                  <div className="flex w-full items-center gap-2">
                    <label htmlFor="scale-input" className="text-sm font-medium text-gray-700 whitespace-nowrap">Scale:</label>
                    <input
                      id="scale-input"
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm text-gray-600 w-8">{scale.toFixed(1)}</span>
                  </div>

                  <div className="flex items-center w-full gap-2">
                    <label htmlFor="rotate-input" className="text-sm font-medium text-gray-700 whitespace-nowrap">Rotate:</label>
                    <input
                      id="rotate-input"
                      type="range"
                      min="-180"
                      max="180"
                      value={rotate}
                      onChange={(e) => setRotate(Math.min(180, Math.max(-180, Number(e.target.value))))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm text-gray-600 w-8">{rotate}°</span>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-4 w-full sm:w-auto sm:justify-end">
                  <button
                    onClick={handleCancelCrop}
                    className="cursor-pointer w-full px-2 py-1 sm:px-4 sm:py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>

                  <button
                    type='button'
                    onClick={handleCropConfirm}
                    className="cursor-pointer w-full px-2 py-1 sm:px-4 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <PiScissorsFill />
                    Crop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Show edit button if already cropped */}
          {isCropped && (
            <div className="flex justify-between sm:justify-center gap-2">
              <button
                onClick={handleCancelCrop}
                className="cursor-pointer w-full sm:w-1/6 px-2 py-1 sm:px-4 sm:py-2 border text-xs sm:text-sm border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsCropped(false)}
                className="cursor-pointer w-full sm:w-1/6 px-2 py-1 sm:px-4 sm:py-2 bg-blue-600 text-xs sm:text-sm text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <CiCrop className='w-5 sm:w-6 h-auto' />
                Edit Crop
              </button>
            </div>
          )}
        </div>
      ))}
      <a
        href="#hidden"
        ref={hiddenAnchorRef}
        download
        style={{
          position: 'absolute',
          top: '-200vh',
          visibility: 'hidden',
        }}
      >
        Hidden download
      </a>
    </div>
  );
}