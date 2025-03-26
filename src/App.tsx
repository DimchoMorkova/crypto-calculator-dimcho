import React, { useState, useEffect } from 'react';
import { Lock, Copy, RefreshCcw } from 'lucide-react';

interface CalculatorValues {
  riskUsd: string;
  entryPrice: string;
  stopLoss: string;
  fee: string;
  positionSizeCrypto: string;
  positionSizeUsd: string;
  margin: string;
}

const initialValues: CalculatorValues = {
  riskUsd: '',
  entryPrice: '',
  stopLoss: '',
  fee: '',
  positionSizeCrypto: '',
  positionSizeUsd: '',
  margin: '',
};

function App() {
  const [values, setValues] = useState<CalculatorValues>(initialValues);
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());
  const [leverage, setLeverage] = useState<number>(0);
  const [liquidationPrice, setLiquidationPrice] = useState<number | null>(null);
  const [isLiquidationPriceGood, setIsLiquidationPriceGood] = useState<boolean | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!lockedFields.has(name)) {
      setValues(prev => ({ ...prev, [name]: value }));
    }
  };

  const toggleLock = (fieldName: string) => {
    setLockedFields(prev => {
      const newLocked = new Set(prev);
      if (newLocked.has(fieldName)) {
        newLocked.delete(fieldName);
      } else {
        newLocked.add(fieldName);
      }
      return newLocked;
    });
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const resetAll = () => {
    setValues(initialValues);
    setLockedFields(new Set());
    setLeverage(0);
    setLiquidationPrice(null);
    setIsLiquidationPriceGood(null);
  };

  const calculateLeverage = (margin: number, positionSizeUsd: number) => {
    if (margin === 0 || isNaN(margin) || isNaN(positionSizeUsd)) return 0;
    return positionSizeUsd / margin;
  };

  const calculateMaintenanceMargin = (positionValue: number) => {
    // Using Bybit's USDT Perpetual MMR tiers (example, verify actual rates)
    const tiers = [
      { limit: 2000000, mmr: 0.005, deduction: 0 },
      { limit: 3000000, mmr: 0.006, deduction: 2000 },
      { limit: 5000000, mmr: 0.007, deduction: 5000 },
      { limit: 10000000, mmr: 0.01, deduction: 20000 },
      // Add more tiers as needed based on Bybit documentation
    ];

    let tier = tiers[tiers.length - 1]; // Default to highest tier if position exceeds all limits
    for (let i = 0; i < tiers.length; i++) {
      if (positionValue <= tiers[i].limit) {
        tier = tiers[i];
        break;
      }
    }

    return { mmr: tier.mmr, deduction: tier.deduction };
  };


  const calculateLiquidationPrice = (
    entryPrice: number,
    initialMargin: number, // This is essentially margin value (positionValue / leverage)
    maintenanceMarginAmount: number, // Calculated as positionValue * mmr - deduction
    positionSizeCrypto: number,
    isLong: boolean
  ) => {
    if (positionSizeCrypto === 0) return NaN; // Avoid division by zero

    // Formula derived from Bybit docs:
    // LiqPrice (Long) = EntryPrice - (InitialMargin - MaintenanceMargin) / PositionSize
    // LiqPrice (Short) = EntryPrice + (InitialMargin - MaintenanceMargin) / PositionSize
    // Where InitialMargin and MaintenanceMargin are in quote currency (USDT)
    // And PositionSize is in base currency (e.g., BTC)

    const marginDifference = initialMargin - maintenanceMarginAmount;

    if (isLong) {
      return entryPrice - (marginDifference / positionSizeCrypto);
    } else {
      return entryPrice + (marginDifference / positionSizeCrypto);
    }
  };


  const isLongPosition = (entryPrice: number, stopLoss: number) => {
    // Assumes stop loss is set correctly (below entry for long, above for short)
    return stopLoss < entryPrice;
  };

  const calculate = () => {
    const riskUsd = parseFloat(values.riskUsd);
    const entryPrice = parseFloat(values.entryPrice);
    const stopLoss = parseFloat(values.stopLoss);
    const feePercent = parseFloat(values.fee) / 100; // Keep as percentage for fee calc

    if (isNaN(riskUsd) || isNaN(entryPrice) || isNaN(stopLoss) || isNaN(feePercent)) return;
    if (entryPrice === stopLoss) return; // Avoid division by zero

    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (riskPerUnit === 0) return; // Avoid division by zero

    // Calculate position size based on risk *without* considering fees first
    const positionSizeCryptoRaw = riskUsd / riskPerUnit;

    // Estimate Taker Fee Cost = Position Size * Entry Price * Fee Rate
    // This is an approximation as the actual fee depends on the final execution price
    const estimatedFeeCost = positionSizeCryptoRaw * entryPrice * feePercent;

    // Adjust risk amount to account for fees. We want the loss *including* fees to equal the desired risk.
    // Actual Loss = (Risk per Unit * Position Size) + (Position Size * Entry Price * Fee Rate)
    // We want Actual Loss <= riskUsd
    // (riskPerUnit * PosSize) + (PosSize * entryPrice * feePercent) <= riskUsd
    // PosSize * (riskPerUnit + entryPrice * feePercent) <= riskUsd
    // PosSize <= riskUsd / (riskPerUnit + entryPrice * feePercent)

    const adjustedPositionSizeCrypto = riskUsd / (riskPerUnit + entryPrice * feePercent);

    const positionSizeUsd = adjustedPositionSizeCrypto * entryPrice;

    setValues(prev => ({
      ...prev,
      positionSizeCrypto: adjustedPositionSizeCrypto.toFixed(8),
      positionSizeUsd: positionSizeUsd.toFixed(2),
    }));

    // Recalculate leverage if margin is present
    const margin = parseFloat(values.margin);
    if (!isNaN(margin) && margin !== 0) {
      const calculatedLeverage = calculateLeverage(margin, positionSizeUsd);
      setLeverage(calculatedLeverage);
    } else {
       // If margin is cleared or invalid, reset leverage unless it's being manually set
       // This logic is handled better by the leverage/margin useEffects
    }
  };

  // Effect for primary calculation when inputs change
  useEffect(() => {
    const requiredFields = ['riskUsd', 'entryPrice', 'stopLoss', 'fee'];
    const allFieldsFilled = requiredFields.every(field => values[field as keyof CalculatorValues] !== '');
    if (allFieldsFilled) {
      calculate();
    } else {
      // Clear results if inputs are missing
      setValues(prev => ({
        ...prev,
        positionSizeCrypto: '',
        positionSizeUsd: '',
      }));
      setLeverage(0);
      setLiquidationPrice(null);
      setIsLiquidationPriceGood(null);
    }
  }, [values.riskUsd, values.entryPrice, values.stopLoss, values.fee]); // Removed values.margin dependency here

  // Effect to update Leverage when Margin or Position Size USD changes
  useEffect(() => {
    const marginNum = parseFloat(values.margin);
    const positionSizeUsdNum = parseFloat(values.positionSizeUsd);

    if (!isNaN(marginNum) && marginNum > 0 && !isNaN(positionSizeUsdNum) && positionSizeUsdNum > 0) {
      const newLeverage = calculateLeverage(marginNum, positionSizeUsdNum);
      setLeverage(newLeverage);
    } else if (values.positionSizeUsd && values.margin) {
       // Handle cases like margin being 0 or invalid input leading to NaN
       setLeverage(0); // Or Infinity, depending on desired behavior for zero margin
    }
    // If positionSizeUsd is empty/invalid, leverage calculation isn't possible, keep current leverage
    // If margin is empty/invalid, leverage calculation isn't possible, keep current leverage (or reset)

  }, [values.margin, values.positionSizeUsd]);


  // Effect to update Margin when Leverage or Position Size USD changes (manual leverage input)
  // This effect seems less critical if leverage is primarily *calculated* from margin.
  // If you allow manual leverage input that *drives* margin, this is needed.
  // Let's assume leverage display is mostly *output*, not input driving margin.
  // Commenting out for now to avoid circular updates. If manual leverage input is desired,
  // we need state to track whether margin or leverage was the last user input.
  /*
  useEffect(() => {
    const positionSizeUsdNum = parseFloat(values.positionSizeUsd);
    // Check if leverage is a valid number and greater than 0
    if (!isNaN(leverage) && leverage > 0 && !isNaN(positionSizeUsdNum) && positionSizeUsdNum > 0) {
      const newMargin = (positionSizeUsdNum / leverage).toFixed(2);
      // Only update margin if it's different to avoid infinite loops
      if (values.margin !== newMargin) {
         // Check if margin field is locked before updating
         if (!lockedFields.has('margin')) {
            setValues(prev => ({ ...prev, margin: newMargin }));
         }
      }
    }
  }, [leverage, values.positionSizeUsd, lockedFields]); // Added lockedFields dependency
  */


  // Effect for Liquidation Price Calculation
  useEffect(() => {
    const entryPrice = parseFloat(values.entryPrice);
    const stopLoss = parseFloat(values.stopLoss); // Needed to determine long/short
    const positionSizeUsd = parseFloat(values.positionSizeUsd);
    const positionSizeCrypto = parseFloat(values.positionSizeCrypto);
    const margin = parseFloat(values.margin); // This is the Initial Margin Amount

    // Ensure all necessary values are valid numbers and > 0 where applicable
    if (!isNaN(entryPrice) && entryPrice > 0 &&
        !isNaN(stopLoss) && // stopLoss can be 0 or negative theoretically, just needs to be valid
        !isNaN(positionSizeUsd) && positionSizeUsd > 0 &&
        !isNaN(positionSizeCrypto) && positionSizeCrypto > 0 &&
        !isNaN(margin) && margin > 0 &&
        leverage > 0) // Ensure leverage is calculated and valid
    {
      const longPosition = isLongPosition(entryPrice, stopLoss);
      const { mmr, deduction } = calculateMaintenanceMargin(positionSizeUsd);

      // Calculate Maintenance Margin Amount in USDT
      const maintenanceMarginAmount = positionSizeUsd * mmr - deduction;

      // Ensure maintenance margin is not negative (can happen with deductions)
      const effectiveMaintenanceMarginAmount = Math.max(0, maintenanceMarginAmount);

      const liqPrice = calculateLiquidationPrice(
        entryPrice,
        margin, // Initial Margin Amount (USDT)
        effectiveMaintenanceMarginAmount, // Maintenance Margin Amount (USDT)
        positionSizeCrypto, // Position Size (Crypto)
        longPosition
      );

      if (!isNaN(liqPrice)) {
        setLiquidationPrice(liqPrice);

        // Check if liquidation price is "good" (further away than stop loss)
        if (longPosition) {
          setIsLiquidationPriceGood(liqPrice < stopLoss);
        } else {
          setIsLiquidationPriceGood(liqPrice > stopLoss);
        }
      } else {
        // Handle potential NaN from calculateLiquidationPrice
        setLiquidationPrice(null);
        setIsLiquidationPriceGood(null);
      }

    } else {
      // Reset liquidation price if inputs are invalid or missing
      setLiquidationPrice(null);
      setIsLiquidationPriceGood(null);
    }
  }, [values.entryPrice, values.stopLoss, values.positionSizeUsd, values.positionSizeCrypto, values.margin, leverage]); // Added positionSizeCrypto


  const handleMarginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMargin = e.target.value;
    // Allow clearing the field or typing numbers
    if (newMargin === '' || /^[0-9]*\.?[0-9]*$/.test(newMargin)) {
       if (!lockedFields.has('margin')) {
         setValues(prev => ({ ...prev, margin: newMargin }));
       }
    }
  };

  // This handler is problematic if leverage is calculated *from* margin.
  // If you want the slider to *set* the leverage and *calculate* margin,
  // you need a different approach, perhaps storing leverage separately
  // and having an effect update margin. For now, the slider is display-only.
  const handleLeverageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     // Currently, leverage is calculated, so the slider doesn't directly set it.
     // If you want the slider to control leverage:
     /*
     const newLeverage = parseFloat(e.target.value);
     setLeverage(newLeverage); // Update leverage state directly
     // Then, an effect would calculate margin based on this newLeverage
     */
     // Keeping it disabled as per current logic:
     console.log("Leverage slider changed (display only)");
  };


  return (
    <div className="min-h-screen bg-gray-900 opacity-[.85] text-gray-100 p-6 relative">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Crypto Position Size Calculator
          </h1>
          <p className="text-white-400">Calculate risk, position size, and liquidation price.</p>
        </div>

        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Risk USD */}
            <div className="space-y-2">
              <label htmlFor="riskUsd" className="block text-sm font-medium text-white">Risk USD</label>
              <div className="relative group">
                <input
                  id="riskUsd"
                  type="number"
                  name="riskUsd"
                  value={values.riskUsd}
                  onChange={handleInputChange}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600 ${
                    lockedFields.has('riskUsd') ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={lockedFields.has('riskUsd')}
                  placeholder="e.g., 100"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Lock
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-300 ${
                    lockedFields.has('riskUsd') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                  }`}
                  size={18}
                  onClick={() => toggleLock('riskUsd')}
                  aria-label={lockedFields.has('riskUsd') ? 'Unlock Risk USD' : 'Lock Risk USD'}
                />
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-2">
              <label htmlFor="entryPrice" className="block text-sm font-medium text-white">Entry Price</label>
              <div className="relative group">
                <input
                  id="entryPrice"
                  type="number"
                  name="entryPrice"
                  value={values.entryPrice}
                  onChange={handleInputChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600"
                  placeholder="e.g., 50000"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.entryPrice)}
                  aria-label="Copy Entry Price"
                />
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Stop Loss */}
            <div className="space-y-2">
              <label htmlFor="stopLoss" className="block text-sm font-medium text-white">Stop Loss</label>
              <div className="relative group">
                <input
                  id="stopLoss"
                  type="number"
                  name="stopLoss"
                  value={values.stopLoss}
                  onChange={handleInputChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600"
                  placeholder="e.g., 49500"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.stopLoss)}
                  aria-label="Copy Stop Loss"
                />
              </div>
            </div>

            {/* Fee % */}
            <div className="space-y-2">
              <label htmlFor="fee" className="block text-sm font-medium text-white">Fee % (Taker)</label>
              <div className="relative group">
                <input
                  id="fee"
                  type="number"
                  name="fee"
                  value={values.fee}
                  onChange={handleInputChange}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600 ${
                    lockedFields.has('fee') ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={lockedFields.has('fee')}
                  placeholder="e.g., 0.06"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Lock
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-300 ${
                    lockedFields.has('fee') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                  }`}
                  size={18}
                  onClick={() => toggleLock('fee')}
                   aria-label={lockedFields.has('fee') ? 'Unlock Fee' : 'Lock Fee'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Margin and Leverage Section */}
        <div className="space-y-4 border-t border-gray-700 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Margin Input */}
            <div className="space-y-2">
              <label htmlFor="margin" className="block text-sm font-medium text-white">Margin (USDT)</label>
              <div className="relative group">
                <input
                  id="margin"
                  type="number"
                  name="margin"
                  value={values.margin}
                  onChange={handleMarginChange}
                   className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600 ${
                    lockedFields.has('margin') ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={lockedFields.has('margin')}
                  placeholder="e.g., 1000"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                 <Lock
                  className={`absolute right-10 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-300 ${
                    lockedFields.has('margin') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                  }`}
                  size={18}
                  onClick={() => toggleLock('margin')}
                  aria-label={lockedFields.has('margin') ? 'Unlock Margin' : 'Lock Margin'}
                />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.margin)}
                  aria-label="Copy Margin"
                />
              </div>
            </div>

            {/* Leverage Display and Slider */}
            <div className="space-y-2">
              <label htmlFor="leverageSlider" className="block text-sm font-medium text-white">
                Leverage: {leverage.toFixed(1)}x
              </label>
              <div className="relative group pt-2"> {/* Added padding-top for spacing */}
                <input
                  id="leverageSlider"
                  type="range"
                  min="1"
                  max="100" // Adjust max based on exchange limits if needed
                  step="0.1"
                  value={leverage} // Display calculated leverage
                  onChange={handleLeverageChange} // Currently display-only
                  // Apply custom styles via CSS using the ID or type selector
                  className="w-full h-2 bg-transparent rounded-lg appearance-none cursor-default custom-slider" // Use custom class
                  disabled // Keep disabled as it's calculated
                />
                 {/* Tooltip or visual indicator could go here */}
              </div>
              {liquidationPrice !== null && !isNaN(liquidationPrice) && (
                <div className={`text-center text-sm mt-2 ${isLiquidationPriceGood === null ? 'text-gray-400' : isLiquidationPriceGood ? 'text-green-500' : 'text-red-500'}`}>
                  Liquidation Price: {liquidationPrice.toFixed(2)}
                  {isLiquidationPriceGood !== null && (
                    isLiquidationPriceGood ? ' (✅ Below SL)' : ' (⚠️ Above SL)'
                  )}
                   {isLiquidationPriceGood === null && ' (Enter valid inputs)'}
                </div>
              )}
               {liquidationPrice === null && values.positionSizeUsd && values.margin && (
                 <div className="text-center text-sm mt-2 text-gray-500">Calculating Liq. Price...</div>
               )}
            </div>
          </div>
        </div>


        {/* Results Section */}
        <div className="space-y-4 border-t border-gray-700 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Position Size Crypto */}
            <div className="space-y-2">
              <label htmlFor="positionSizeCrypto" className="block text-sm font-medium text-white">Position Size (Crypto)</label>
              <div className="relative group">
                <input
                  id="positionSizeCrypto"
                  type="text"
                  readOnly
                  value={values.positionSizeCrypto || '0.00000000'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 cursor-not-allowed text-gray-400"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.positionSizeCrypto)}
                  aria-label="Copy Position Size Crypto"
                />
              </div>
            </div>
            {/* Position Size USD */}
            <div className="space-y-2">
              <label htmlFor="positionSizeUsd" className="block text-sm font-medium text-white">Position Size (USD)</label>
              <div className="relative group">
                <input
                  id="positionSizeUsd"
                  type="text"
                  readOnly
                  value={values.positionSizeUsd || '0.00'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 cursor-not-allowed text-gray-400"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.positionSizeUsd)}
                  aria-label="Copy Position Size USD"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Reset Button */}
        <div className="flex justify-center pt-6">
          <button
            onClick={resetAll}
            className="px-6 py-3 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg shadow-md transition-all duration-300 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
          >
            <RefreshCcw size={18} />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {/* Footer/Logo */}
      <div className="absolute bottom-4 right-4 flex items-center text-sm text-gray-400">
        <span className="mr-2">Optimized for</span>
        <img
          src="https://i.imgur.com/sVfhu73.png" // Ensure this is the correct Bybit logo URL
          alt="Bybit Logo"
          className="h-5" // Adjust size as needed
        />
      </div>
    </div>
  );
}

export default App;
