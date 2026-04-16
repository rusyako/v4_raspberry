import { AnimatedBackground } from '../shared/background';
import { Toast, useToast } from '../shared/toast';
import { RETURN_BARCODES_STORAGE_KEY, TAKE_BARCODES_STORAGE_KEY } from '../shared/storage';
import { ActionPanel, HomePanel, SessionPanel } from './kiosk/kiosk-views';
import { useKioskController } from './kiosk/use-kiosk-controller';

export function KioskPage() {
  const { toast, showToast, clearToast } = useToast();

  const {
    language,
    setLanguage,
    t,
    laptopCount,
    view,
    takeBarcodes,
    setTakeBarcodes,
    returnBarcodes,
    setReturnBarcodes,
    screenClassName,
    clearSessionAndGoHome,
    goToCheckout,
    goToReturn,
    submitTake,
    submitReturn
  } = useKioskController(showToast);

  return (
    <div className={screenClassName}>
      <AnimatedBackground />
      <Toast toast={toast} onClose={clearToast} />

      {view === 'home' ? <HomePanel language={language} setLanguage={setLanguage} laptopCount={laptopCount} t={t} /> : null}

      {view === 'actions' ? <ActionPanel onTake={goToCheckout} onReturn={goToReturn} language={language} setLanguage={setLanguage} t={t} /> : null}

      {view === 'checkout' ? (
        <SessionPanel
          title={t.kiosk.checkoutTitle}
          description={t.kiosk.checkoutDescription}
          placeholder={t.kiosk.checkoutPlaceholder}
          countLabel={t.kiosk.checkoutCount}
          submitLabel={t.kiosk.checkoutSubmit}
          storageKey={TAKE_BARCODES_STORAGE_KEY}
          barcodes={takeBarcodes}
          onBarcodesChange={setTakeBarcodes}
          onCancel={clearSessionAndGoHome}
          onSubmit={submitTake}
          showToast={showToast}
          language={language}
          setLanguage={setLanguage}
          t={t}
        />
      ) : null}

      {view === 'return' ? (
        <SessionPanel
          title={t.kiosk.returnTitle}
          description={t.kiosk.returnDescription}
          placeholder={t.kiosk.returnPlaceholder}
          countLabel={t.kiosk.returnCount}
          submitLabel={t.kiosk.returnSubmit}
          storageKey={RETURN_BARCODES_STORAGE_KEY}
          barcodes={returnBarcodes}
          onBarcodesChange={setReturnBarcodes}
          onCancel={clearSessionAndGoHome}
          onSubmit={submitReturn}
          showToast={showToast}
          language={language}
          setLanguage={setLanguage}
          t={t}
        />
      ) : null}
    </div>
  );
}
