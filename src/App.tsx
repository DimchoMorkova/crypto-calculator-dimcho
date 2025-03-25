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
    if (margin === 0) return 0;
    return positionSizeUsd / margin;
  };

  const calculateMaintenanceMargin = (positionValue: number) => {
    const tiers = [
      { riskLimit: 2000000, leverage: 100, mmr: 0.005, deduction: 0 },
      { riskLimit: 2600000, leverage: 90, mmr: 0.0056, deduction: 1200 },
      { riskLimit: 3200000, leverage: 80, mmr: 0.0063, deduction: 3020 },
      { riskLimit: 3800000, leverage: 75, mmr: 0.0067, deduction: 4300 },
      { riskLimit: 4400000, leverage: 70, mmr: 0.0071, deduction: 5820 },
      { riskLimit: 5000000, leverage: 65, mmr: 0.0077, deduction: 8460 },
      { riskLimit: 5600000, leverage: 55, mmr: 0.0091, deduction: 15460 },
    ];

    let tier = tiers[0];
    for (let i = 0; i < tiers.length; i++) {
      if (positionValue <= tiers[i].riskLimit) {
        tier = tiers[i];
        break;
      }
      if (i === tiers.length - 1) tier = tiers[i];
    }

    return { mmr: tier.mmr, deduction: tier.deduction };
  };

  const calculateLiquidationPrice = (
    entryPrice: number,
    initialMargin: number,
    maintenanceMargin: number,
    positionSize: number,
    isLong: boolean
  ) => {
    if (isLong) {
      return entryPrice - (initialMargin - maintenanceMargin) / positionSize;
    } else {
      return entryPrice + (initialMargin - maintenanceMargin) / positionSize;
    }
  };

  const isLongPosition = (entryPrice: number, stopLoss: number) => {
    return stopLoss < entryPrice;
  };

  const calculate = () => {
    const riskUsd = parseFloat(values.riskUsd);
    const entryPrice = parseFloat(values.entryPrice);
    const stopLoss = parseFloat(values.stopLoss);
    const fee = parseFloat(values.fee) / 100;
    const margin = parseFloat(values.margin);

    if (isNaN(riskUsd) || isNaN(entryPrice) || isNaN(stopLoss) || isNaN(fee)) return;
    if (entryPrice === stopLoss) return;

    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const positionSizeCrypto = riskUsd / riskPerUnit;
    const adjustedPositionSizeCrypto = positionSizeCrypto / (1 + fee);
    const usdAmount = adjustedPositionSizeCrypto * entryPrice;

    setValues(prev => ({
      ...prev,
      positionSizeCrypto: adjustedPositionSizeCrypto.toFixed(8),
      positionSizeUsd: usdAmount.toFixed(2),
    }));

    if (!isNaN(margin) && margin !== 0) {
      const calculatedLeverage = calculateLeverage(margin, usdAmount);
      setLeverage(calculatedLeverage);
    }
  };

  useEffect(() => {
    const requiredFields = ['riskUsd', 'entryPrice', 'stopLoss', 'fee'];
    const allFieldsFilled = requiredFields.every(field => values[field as keyof CalculatorValues] !== '');
    if (allFieldsFilled) calculate();
  }, [values.riskUsd, values.entryPrice, values.stopLoss, values.fee, values.margin]);

  useEffect(() => {
    if (values.positionSizeUsd) {
      const positionSizeUsdNum = parseFloat(values.positionSizeUsd);
      const marginNum = parseFloat(values.margin);

      if (!isNaN(positionSizeUsdNum) && !isNaN(marginNum) && marginNum !== 0) {
        const calculatedLeverage = calculateLeverage(marginNum, positionSizeUsdNum);
        setLeverage(calculatedLeverage);
      }
    }
  }, [values.margin, values.positionSizeUsd]);

  const handleMarginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMargin = e.target.value;
    setValues(prev => ({ ...prev, margin: newMargin }));
  };

  const handleLeverageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLeverage = parseFloat(e.target.value);
    setLeverage(newLeverage);
    const positionSizeUsdNum = parseFloat(values.positionSizeUsd);

    if (!isNaN(newLeverage) && newLeverage !== 0 && !isNaN(positionSizeUsdNum)) {
      const newMargin = (positionSizeUsdNum / newLeverage).toFixed(2);
      setValues(prev => ({ ...prev, margin: newMargin }));
    }
  };

  useEffect(() => {
    const entryPrice = parseFloat(values.entryPrice);
    const stopLoss = parseFloat(values.stopLoss);
    const positionSizeUsd = parseFloat(values.positionSizeUsd);
    const margin = parseFloat(values.margin);

    if (!isNaN(entryPrice) && !isNaN(stopLoss) && !isNaN(positionSizeUsd) && !isNaN(margin) && leverage > 0) {
      const longPosition = isLongPosition(entryPrice, stopLoss);
      const { mmr, deduction } = calculateMaintenanceMargin(positionSizeUsd);
      const initialMargin = positionSizeUsd / leverage;
      const maintenanceMargin = positionSizeUsd * mmr - deduction;
      const liquidationPrice = calculateLiquidationPrice(
        entryPrice,
        initialMargin,
        maintenanceMargin,
        parseFloat(values.positionSizeCrypto),
        longPosition
      );

      setLiquidationPrice(liquidationPrice);

      if (longPosition) {
        setIsLiquidationPriceGood(liquidationPrice < stopLoss);
      } else {
        setIsLiquidationPriceGood(liquidationPrice > stopLoss);
      }
    } else {
      setLiquidationPrice(null);
      setIsLiquidationPriceGood(null);
    }
  }, [values.entryPrice, values.stopLoss, values.positionSizeUsd, values.margin, leverage, values.positionSizeCrypto]);

  return (
    <div className="min-h-screen bg-gray-900 opacity-[.85] text-gray-100 p-6 relative">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Crypto Position Size Calculator
          </h1>
          <p className="text-white-400">✗</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Risk USD</label>
              <div className="relative group">
                <input
                  type="number"
                  name="riskUsd"
                  value={values.riskUsd}
                  onChange={handleInputChange}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600 ${
                    lockedFields.has('riskUsd') ? 'opacity-50' : ''
                  }`}
                  disabled={lockedFields.has('riskUsd')}
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Lock
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-300 ${
                    lockedFields.has('riskUsd') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                  }`}
                  size={18}
                  onClick={() => toggleLock('riskUsd')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Entry Price</label>
              <div className="relative group">
                <input
                  type="number"
                  name="entryPrice"
                  value={values.entryPrice}
                  onChange={handleInputChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.entryPrice)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Stop Loss</label>
              <div className="relative group">
                <input
                  type="number"
                  name="stopLoss"
                  value={values.stopLoss}
                  onChange={handleInputChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.stopLoss)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Fee %</label>
              <div className="relative group">
                <input
                  type="number"
                  name="fee"
                  value={values.fee}
                  onChange={handleInputChange}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600 ${
                    lockedFields.has('fee') ? 'opacity-50' : ''
                  }`}
                  disabled={lockedFields.has('fee')}
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Lock
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-300 ${
                    lockedFields.has('fee') ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'
                  }`}
                  size={18}
                  onClick={() => toggleLock('fee')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Margin</label>
              <div className="relative group">
                <input
                  type="number"
                  name="margin"
                  value={values.margin}
                  onChange={handleMarginChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 group-hover:border-gray-600"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.margin)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Leverage: {leverage.toFixed(1)}x</label>
              <div className="relative group">
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="0.1"
                  value={leverage.toFixed(1)}
                  onChange={handleLeverageChange}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-not-allowed"
                  disabled
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20  group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              </div>
              {liquidationPrice !== null && (
                <div className="text-center text-sm mt-2">
                  Liquidation Price: {liquidationPrice.toFixed(2)} (
                  {isLiquidationPriceGood ? (
                    <span className="text-green-500">✅</span>
                  ) : (
                    <span className="text-red-500">⚠️</span>
                  )}
                  )
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Position Size Crypto</label>
              <div className="relative group">
                <input
                  type="text"
                  readOnly
                  value={values.positionSizeCrypto}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 cursor-not-allowed"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.positionSizeCrypto)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Position Size USD</label>
              <div className="relative group">
                <input
                  type="text"
                  readOnly
                  value={values.positionSizeUsd}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 cursor-not-allowed"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Copy
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white cursor-pointer hover:text-blue-500 transition-colors duration-300"
                  size={18}
                  onClick={() => copyToClipboard(values.positionSizeUsd)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={resetAll}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors duration-300"
          >
            <RefreshCcw className="inline-block mr-2" size={18} />
            Reset All
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center text-sm text-gray-300">
        <span className="mr-2">Optimized for</span>
        <img
          src="https://i.imgur.com/sVfhu73.png"
          alt="Bybit Logo"
          className="h-5"
        />
      </div>
    </div>
  );
}

export default App;
