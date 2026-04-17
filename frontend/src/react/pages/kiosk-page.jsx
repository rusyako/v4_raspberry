import { AnimatedBackground } from '../shared/background';
import { Toast, useToast } from '../shared/toast';
import { RETURN_BARCODES_STORAGE_KEY, TAKE_BARCODES_STORAGE_KEY } from '../shared/storage';
import { KioskActionsView, KioskHomeView, KioskSessionView } from './kiosk/kiosk-views';
import { useKioskController } from './kiosk/use-kiosk-controller';

export function KioskPage() {
  const { toast, showToast, clearToast } = useToast();

  const {
    language,
    setLanguage,
    t,
    stationCellsStatus,
    activeBorrowedRecords,
    isActiveBorrowedLoading,
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

      {view === 'home' ? (
        <KioskHomeView
          language={language}
          setLanguage={setLanguage}
          stationCellsStatus={stationCellsStatus}
          activeBorrowedRecords={activeBorrowedRecords}
          isActiveBorrowedLoading={isActiveBorrowedLoading}
          t={t}
        />
      ) : null}

      {view === 'actions' ? <KioskActionsView onTake={goToCheckout} onReturn={goToReturn} language={language} setLanguage={setLanguage} t={t} /> : null}

      {view === 'checkout' ? (
        <KioskSessionView
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
        <KioskSessionView
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
