//+------------------------------------------------------------------+
//|                                     SetupMint_Elefin_Bridge.mq5  |
//|               Copyright 2026, SetupMint Trading Analytics Engine  |
//|                                      https://setupmint.com       |
//+------------------------------------------------------------------+
#property copyright   "SetupMint"
#property link        "https://setupmint.com"
#property version     "2.40"
#property description "Automated Real-Time 2-Way Execution, Live Trade Sync & Direct Chart Capture Bridge for SetupMint"
#property strict

#include <Trade\Trade.mqh>

//--- Input parameters
input string   InpSetupMintUrl = "http://13.205.58.162/api/v1/integrations/mt5/webhook"; // SetupMint Webhook URL
input string   InpToken        = "6af1fa0735d0f0f584d918bf"; // Account Webhook Token (or 'elefin')
input int      InpSyncTimerSec = 1;                           // Periodic Sync Interval (Seconds, 1s for instant live ticks)
input bool     InpAutoCaptureScreenshots = true;              // Auto-Capture Chart Screenshot on Trade Entry & Exit

//--- Global Variables
datetime lastHistoryCheckTime = 0;
CTrade   m_trade;

//--- Live Position Excursion Tracker (Zero Discrepancy MAE/MFE Capture)
struct PositionExcursionTracker {
   ulong    ticket;
   double   openPrice;
   double   peakPrice;     // Best favorable price
   double   worstPrice;    // Deepest adverse price
   double   peakProfit;    // Highest floating profit reached
   double   maxDrawdown;   // Deepest floating drawdown reached
   datetime openTime;
};
PositionExcursionTracker g_excursions[256];
int g_excursionCount = 0;

//--- Helper: Format ISO 8601 UTC timestamp
string FormatIsoUtc(datetime tBroker)
{
   if(tBroker <= 0) return "";
   int gmtOffset = (int)(TimeCurrent() - TimeGMT());
   datetime tGmt = tBroker - gmtOffset;
   string sDate = TimeToString(tGmt, TIME_DATE);
   string sTime = TimeToString(tGmt, TIME_SECONDS);
   StringReplace(sDate, ".", "-");
   return sDate + "T" + sTime + ".000Z";
}

//--- Helper: Real-time update of live open position excursions
void UpdateExcursionTracking()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;

      double curPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
      double profit   = PositionGetDouble(POSITION_PROFIT);
      double openP    = PositionGetDouble(POSITION_PRICE_OPEN);
      ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      datetime openT  = (datetime)PositionGetInteger(POSITION_TIME);

      int idx = -1;
      for(int k = 0; k < g_excursionCount; k++)
      {
         if(g_excursions[k].ticket == ticket) { idx = k; break; }
      }
      if(idx == -1 && g_excursionCount < 256)
      {
         idx = g_excursionCount++;
         g_excursions[idx].ticket = ticket;
         g_excursions[idx].openPrice = openP;
         g_excursions[idx].peakPrice = curPrice > 0 ? curPrice : openP;
         g_excursions[idx].worstPrice = curPrice > 0 ? curPrice : openP;
         g_excursions[idx].peakProfit = profit;
         g_excursions[idx].maxDrawdown = profit;
         g_excursions[idx].openTime = openT;
      }
      if(idx >= 0 && curPrice > 0)
      {
         if(profit > g_excursions[idx].peakProfit)
            g_excursions[idx].peakProfit = profit;
         if(profit < g_excursions[idx].maxDrawdown)
            g_excursions[idx].maxDrawdown = profit;

         if(type == POSITION_TYPE_BUY)
         {
            if(curPrice > g_excursions[idx].peakPrice)  g_excursions[idx].peakPrice = curPrice;
            if(curPrice < g_excursions[idx].worstPrice) g_excursions[idx].worstPrice = curPrice;
         }
         else
         {
            if(curPrice < g_excursions[idx].peakPrice)  g_excursions[idx].peakPrice = curPrice;
            if(curPrice > g_excursions[idx].worstPrice) g_excursions[idx].worstPrice = curPrice;
         }
      }
   }
}

//--- Deduplication Tracker for closed deals
ulong    g_processedDeals[1024];
int      g_processedCount = 0;

bool IsDealProcessed(ulong ticket)
{
   for(int i = 0; i < g_processedCount; i++)
   {
      if(g_processedDeals[i] == ticket) return true;
   }
   return false;
}

void MarkDealProcessed(ulong ticket)
{
   if(g_processedCount >= 1024)
   {
      for(int i = 0; i < 1023; i++)
      {
         g_processedDeals[i] = g_processedDeals[i + 1];
      }
      g_processedCount = 1023;
   }
   g_processedDeals[g_processedCount++] = ticket;
}

// Forward declarations
void ProcessSetupMintCommands(string responseJson);
void SyncAllActivePositions();
void CheckClosedDeals();
void SyncAllTodayClosedDeals();
void CreateOnChartSyncButton();

//+------------------------------------------------------------------+
//| Helper string parsers for lightweight JSON decoding              |
//+------------------------------------------------------------------+
string ExtractJsonString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if(start == -1) return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end == -1) return "";
   return StringSubstr(json, start, end - start);
}

double ExtractJsonNumber(string json, string key)
{
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start == -1) return 0.0;
   start += StringLen(search);
   int endComma = StringFind(json, ",", start);
   int endBrace = StringFind(json, "}", start);
   int end = endComma;
   if(end == -1 || (endBrace != -1 && endBrace < end)) end = endBrace;
   if(end == -1) end = StringLen(json);
   string valStr = StringSubstr(json, start, end - start);
   StringTrimLeft(valStr);
   StringTrimRight(valStr);
   return StringToDouble(valStr);
}

long ExtractJsonLong(string json, string key)
{
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start == -1) return 0;
   start += StringLen(search);
   int endComma = StringFind(json, ",", start);
   int endBrace = StringFind(json, "}", start);
   int end = endComma;
   if(end == -1 || (endBrace != -1 && endBrace < end)) end = endBrace;
   if(end == -1) end = StringLen(json);
   string valStr = StringSubstr(json, start, end - start);
   StringTrimLeft(valStr);
   StringTrimRight(valStr);
   return StringToInteger(valStr);
}

//+------------------------------------------------------------------+
//| Helper to send HTTP POST request & process inbound commands      |
//+------------------------------------------------------------------+
bool SendJsonToSetupMint(string jsonPayload, bool handleCommands = true)
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n" +
                    "x-webhook-token: " + InpToken + "\r\n";
   
   StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Remove null terminator at end
   int dataSize = ArraySize(postData) - 1;
   if(dataSize <= 0) return false;
   ArrayResize(postData, dataSize);

   ResetLastError();
   int res = WebRequest("POST", InpSetupMintUrl, headers, 3000, postData, resultData, resultHeaders);
   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
      {
         Print("[SetupMint] ERROR: WebRequest not allowed! Add '", InpSetupMintUrl, "' in MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      else
      {
         Print("[SetupMint] WebRequest error code: ", err);
      }
      return false;
   }
   else if(res < 200 || res >= 300)
   {
      Print("[SetupMint] WebRequest HTTP response error: ", res);
      return false;
   }

   // Process inbound execution commands from SetupMint
   if(handleCommands && ArraySize(resultData) > 0)
   {
      string responseJson = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      ProcessSetupMintCommands(responseJson);
   }

   return true;
}

//--- Entry Screenshot Tracking (Prevent duplicate entry screenshots for same ticket)
ulong g_capturedEntryTickets[1024];
int g_capturedEntryCount = 0;

bool HasCapturedEntryScreenshot(ulong ticket)
{
   for(int i = 0; i < g_capturedEntryCount; i++)
   {
      if(g_capturedEntryTickets[i] == ticket) return true;
   }
   return false;
}

void MarkEntryScreenshotCaptured(ulong ticket)
{
   if(g_capturedEntryCount >= 1024)
   {
      for(int i = 0; i < 1023; i++)
      {
         g_capturedEntryTickets[i] = g_capturedEntryTickets[i + 1];
      }
      g_capturedEntryCount = 1023;
   }
   g_capturedEntryTickets[g_capturedEntryCount++] = ticket;
}

//+------------------------------------------------------------------+
//| Capture & Upload Chart Screenshot Direct from MT5 Terminal       |
//+------------------------------------------------------------------+
bool CaptureAndSendScreenshot(ulong ticket, string eventType, string sym = "")
{
   if(!InpAutoCaptureScreenshots && eventType != "MANUAL") return false;
   if(StringLen(sym) == 0) sym = _Symbol;

   string filename = "sm_shot_" + IntegerToString(ticket) + "_" + eventType + ".png";

   // ChartScreenShot saves relative to MQL5\Files directory
   ResetLastError();
   bool shotOk = ChartScreenShot(0, filename, 1280, 720, ALIGN_RIGHT);
   if(!shotOk)
   {
      Print("[SetupMint] ChartScreenShot failed for ticket #", ticket, ", error: ", GetLastError());
      return false;
   }

   int hFile = FileOpen(filename, FILE_READ | FILE_BIN);
   if(hFile == INVALID_HANDLE)
   {
      Print("[SetupMint] Failed to open screenshot file: ", filename, ", error: ", GetLastError());
      return false;
   }

   ulong fSize = FileSize(hFile);
   if(fSize <= 0)
   {
      FileClose(hFile);
      FileDelete(filename);
      return false;
   }

   uchar fileBytes[];
   ArrayResize(fileBytes, (int)fSize);
   FileReadArray(hFile, fileBytes, 0, (int)fSize);
   FileClose(hFile);
   FileDelete(filename); // Clean up temporary screenshot file

   // Base64 encode file buffer using native CryptEncode
   uchar key[] = {};
   uchar base64Bytes[];
   ResetLastError();
   int encRes = CryptEncode(CRYPT_BASE64, fileBytes, key, base64Bytes);
   if(encRes <= 0)
   {
      Print("[SetupMint] CryptEncode BASE64 failed, error: ", GetLastError());
      return false;
   }

   string b64Str = CharArrayToString(base64Bytes, 0, WHOLE_ARRAY, CP_UTF8);

   // Derive screenshot upload URL from webhook URL
   string shotUrl = InpSetupMintUrl;
   StringReplace(shotUrl, "/webhook", "/screenshot");

   string json = "{" +
      "\"ticket\":" + IntegerToString(ticket) + "," +
      "\"eventType\":\"" + eventType + "\"," +
      "\"symbol\":\"" + sym + "\"," +
      "\"timeframe\":\"" + EnumToString((ENUM_TIMEFRAMES)_Period) + "\"," +
      "\"mimeType\":\"image/png\"," +
      "\"imageBase64\":\"" + b64Str + "\"" +
   "}";

   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n" +
                    "x-webhook-token: " + InpToken + "\r\n";

   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   int dataSize = ArraySize(postData) - 1;
   if(dataSize <= 0) return false;
   ArrayResize(postData, dataSize);

   ResetLastError();
   int res = WebRequest("POST", shotUrl, headers, 6000, postData, resultData, resultHeaders);
   if(res >= 200 && res < 300)
   {
      Print("[SetupMint] 📸 Direct MT5 chart screenshot uploaded for ticket #", ticket, " (", eventType, ", ", sym, ")");
      return true;
   }
   else
   {
      Print("[SetupMint] Screenshot upload HTTP error: ", res, ", code: ", GetLastError());
      return false;
   }
}


//+------------------------------------------------------------------+
//| Helper: Configure optimal trade filling mode dynamically per sym |
//+------------------------------------------------------------------+
void SetFillingModeForSymbol(string sym)
{
   uint filling = (uint)SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   ENUM_SYMBOL_TRADE_EXECUTION exec = (ENUM_SYMBOL_TRADE_EXECUTION)SymbolInfoInteger(sym, SYMBOL_TRADE_EXEMODE);

   if((filling & SYMBOL_FILLING_IOC) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((filling & SYMBOL_FILLING_FOK) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if(exec == SYMBOL_TRADE_EXECUTION_MARKET)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      m_trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

//+------------------------------------------------------------------+
//| Resilient Position Close / Partial Close Helper                  |
//| Closes position completely or partially by ticket                |
//| Works on Hedging & Netting, auto-resolves filling modes & steps  |
//+------------------------------------------------------------------+
bool ClosePositionByTicket(ulong ticket, double requestedVolume, string &outMsg)
{
   if(!PositionSelectByTicket(ticket))
   {
      outMsg = "Position ticket #" + IntegerToString(ticket) + " not found or already closed";
      return false;
   }

   string symbol = PositionGetString(POSITION_SYMBOL);
   double posVolume = PositionGetDouble(POSITION_VOLUME);
   ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

   double closeVol = requestedVolume;
   if(closeVol <= 0 || closeVol >= posVolume)
      closeVol = posVolume;

   // Volume normalization according to broker constraints
   double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(lotStep <= 0) lotStep = 0.01;
   if(minLot <= 0) minLot = 0.01;

   closeVol = MathRound(closeVol / lotStep) * lotStep;
   closeVol = NormalizeDouble(closeVol, 2);
   if(closeVol < minLot) closeVol = minLot;
   if(closeVol > posVolume) closeVol = posVolume;

   // 1. Determine execution and filling modes
   uint fillingMode = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   ENUM_SYMBOL_TRADE_EXECUTION execMode = (ENUM_SYMBOL_TRADE_EXECUTION)SymbolInfoInteger(symbol, SYMBOL_TRADE_EXEMODE);

   ENUM_ORDER_TYPE_FILLING fillModes[3];
   int fillModesCount = 0;

   // Prioritize IOC for Market Execution, then FOK, then RETURN
   if((fillingMode & SYMBOL_FILLING_IOC) != 0) fillModes[fillModesCount++] = ORDER_FILLING_IOC;
   if((fillingMode & SYMBOL_FILLING_FOK) != 0) fillModes[fillModesCount++] = ORDER_FILLING_FOK;
   if((fillingMode & SYMBOL_FILLING_RETURN) != 0) fillModes[fillModesCount++] = ORDER_FILLING_RETURN;

   if(fillModesCount == 0)
   {
      fillModes[0] = ORDER_FILLING_IOC;
      fillModes[1] = ORDER_FILLING_FOK;
      fillModes[2] = ORDER_FILLING_RETURN;
      fillModesCount = 3;
   }

   MqlTradeRequest request;
   MqlTradeResult  result;

   int lastErr = 0;
   uint lastRetcode = 0;
   string lastDesc = "";

   // Try sending native TRADE_ACTION_DEAL targeting position ticket with supported filling modes
   for(int f = 0; f < fillModesCount; f++)
   {
      ZeroMemory(request);
      ZeroMemory(result);

      request.action       = TRADE_ACTION_DEAL;
      request.position     = ticket;
      request.symbol       = symbol;
      request.volume       = closeVol;
      request.deviation    = 50;
      request.magic        = 1998;
      request.type_filling = fillModes[f];

      if(posType == POSITION_TYPE_BUY)
      {
         request.type  = ORDER_TYPE_SELL;
         request.price = SymbolInfoDouble(symbol, SYMBOL_BID);
      }
      else
      {
         request.type  = ORDER_TYPE_BUY;
         request.price = SymbolInfoDouble(symbol, SYMBOL_ASK);
      }

      ResetLastError();
      bool sent = OrderSend(request, result);
      lastRetcode = result.retcode;
      lastErr = GetLastError();
      lastDesc = result.comment;
      if(StringLen(lastDesc) == 0) lastDesc = IntegerToString(lastRetcode);

      if(sent && (result.retcode == TRADE_RETCODE_DONE || result.retcode == TRADE_RETCODE_DONE_PARTIAL || result.retcode == TRADE_RETCODE_PLACED))
      {
         outMsg = (closeVol < posVolume)
            ? ("Partial " + DoubleToString(closeVol, 2) + " lots closed successfully on ticket #" + IntegerToString(ticket))
            : ("Position #" + IntegerToString(ticket) + " closed completely (" + DoubleToString(closeVol, 2) + " lots)");
         return true;
      }

      // If invalid filling mode (retcode 10030 or error 4756), try next filling mode
      if(result.retcode == 10030 || lastErr == 4756 || result.retcode == 10016)
      {
         Print("[SetupMint] OrderSend filling mode ", EnumToString(fillModes[f]), " rejected on #", ticket, " (retcode ", result.retcode, "), trying alternate...");
         continue;
      }

      // If already closed / no changes
      if(result.retcode == 10025 || result.retcode == 10009 || result.retcode == 10004)
      {
         outMsg = "Position #" + IntegerToString(ticket) + " processed (retcode " + IntegerToString(result.retcode) + ")";
         return true;
      }

      break;
   }

   // 2. Secondary fallback via CTrade class
   ResetLastError();
   SetFillingModeForSymbol(symbol);
   bool fallbackRes = false;
   if(closeVol < posVolume)
   {
      fallbackRes = m_trade.PositionClosePartial(ticket, closeVol, 50);
   }
   else
   {
      fallbackRes = m_trade.PositionClose(ticket, 50);
   }

   uint fbRetcode = m_trade.ResultRetcode();
   if(fallbackRes || fbRetcode == TRADE_RETCODE_DONE || fbRetcode == TRADE_RETCODE_DONE_PARTIAL || fbRetcode == TRADE_RETCODE_PLACED)
   {
      outMsg = (closeVol < posVolume)
         ? ("Partial " + DoubleToString(closeVol, 2) + " lots closed successfully (via fallback) on ticket #" + IntegerToString(ticket))
         : ("Position #" + IntegerToString(ticket) + " closed successfully (via fallback)");
      return true;
   }

   outMsg = "PositionClose failed: " + IntegerToString(lastErr > 0 ? lastErr : GetLastError()) +
            " (retcode " + IntegerToString(lastRetcode > 0 ? lastRetcode : fbRetcode) + ") - " +
            (StringLen(lastDesc) > 0 ? lastDesc : m_trade.ResultRetcodeDescription());
   return false;
}

//+------------------------------------------------------------------+
//| Process and execute inbound broker commands from SetupMint       |
//+------------------------------------------------------------------+
void ProcessSetupMintCommands(string responseJson)
{
   int cmdPos = StringFind(responseJson, "\"commands\":[");
   if(cmdPos == -1) return;
   
   cmdPos += StringLen("\"commands\":[");
   int cmdEnd = StringFind(responseJson, "]", cmdPos);
   if(cmdEnd == -1 || cmdEnd <= cmdPos) return;
   
   string commandsBlock = StringSubstr(responseJson, cmdPos, cmdEnd - cmdPos);
   StringTrimLeft(commandsBlock);
   StringTrimRight(commandsBlock);
   if(StringLen(commandsBlock) == 0) return;
   
   string resultsJson = "";
   int executedCount = 0;
   
   int curIdx = 0;
   while(curIdx < StringLen(commandsBlock))
   {
      int objStart = StringFind(commandsBlock, "{", curIdx);
      if(objStart == -1) break;
      int objEnd = StringFind(commandsBlock, "}", objStart);
      if(objEnd == -1) break;
      
      string cmdObj = StringSubstr(commandsBlock, objStart, objEnd - objStart + 1);
      curIdx = objEnd + 1;
      
      string commandId = ExtractJsonString(cmdObj, "commandId");
      string action = ExtractJsonString(cmdObj, "action");
      ulong ticket = (ulong)ExtractJsonLong(cmdObj, "ticket");
      double sl = ExtractJsonNumber(cmdObj, "stopLoss");
      double tp = ExtractJsonNumber(cmdObj, "takeProfit");
      double volume = ExtractJsonNumber(cmdObj, "volume");
      
      if((ticket <= 0 && action != "FETCH_HISTORY" && action != "OPEN_ORDER") || StringLen(action) == 0) continue;
      
      bool success = false;
      string msg = "";
      
      if(action == "FETCH_HISTORY")
      {
         Print("[SetupMint] ⚡ FETCH_HISTORY command received from SetupMint! Syncing all today's closed deals...");
         SyncAllTodayClosedDeals();
         success = true;
         msg = "All today's deals pushed to SetupMint";
      }
      else if(action == "OPEN_ORDER")
      {
         string symbol = ExtractJsonString(cmdObj, "symbol");
         string side = ExtractJsonString(cmdObj, "side");
         string orderType = ExtractJsonString(cmdObj, "orderType");
         double price = ExtractJsonNumber(cmdObj, "price");
         string comment = ExtractJsonString(cmdObj, "comment");
         if(StringLen(symbol) == 0) symbol = _Symbol;
         if(StringLen(comment) == 0) comment = "SetupMint-Telegram";

         SetFillingModeForSymbol(symbol);

         double minVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
         if(volume <= 0) volume = minVol > 0 ? minVol : 0.01;

         ResetLastError();
         bool openRes = false;
         if(orderType == "LIMIT")
         {
            if(side == "BUY")
               openRes = m_trade.BuyLimit(volume, price, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
            else if(side == "SELL")
               openRes = m_trade.SellLimit(volume, price, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else if(orderType == "STOP")
         {
            if(side == "BUY")
               openRes = m_trade.BuyStop(volume, price, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
            else if(side == "SELL")
               openRes = m_trade.SellStop(volume, price, symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else
         {
            if(side == "BUY")
            {
               openRes = m_trade.Buy(volume, symbol, 0, sl, tp, comment);
            }
            else if(side == "SELL")
            {
               openRes = m_trade.Sell(volume, symbol, 0, sl, tp, comment);
            }
         }

         // Resilient Stop Handling: If initial stops are rejected by broker (e.g. fast market tick or stop level),
         // fill market order first and immediately set normalized SL/TP based on actual fill price
         if(!openRes && (m_trade.ResultRetcode() == 10016 || GetLastError() == 4756))
         {
            Print("[SetupMint] Initial stops rejected by broker. Retrying market order at current market price...");
            ResetLastError();
            if(side == "BUY")  openRes = m_trade.Buy(volume, symbol, 0, 0, 0, comment);
            else if(side == "SELL") openRes = m_trade.Sell(volume, symbol, 0, 0, 0, comment);

            if(openRes)
            {
               double fillPrice = m_trade.ResultPrice();
               ulong posTicket = m_trade.ResultOrder() > 0 ? m_trade.ResultOrder() : m_trade.ResultDeal();
               double slDist = MathAbs(sl - fillPrice);
               double tpDist = MathAbs(tp - fillPrice);
               if(slDist > 0 && posTicket > 0)
               {
                  double adjustedSl = (side == "BUY") ? fillPrice - slDist : fillPrice + slDist;
                  double adjustedTp = tpDist > 0 ? ((side == "BUY") ? fillPrice + tpDist : fillPrice - tpDist) : 0;
                  m_trade.PositionModify(posTicket, adjustedSl, adjustedTp);
               }
            }
         }

         if(openRes)
         {
            ulong dealTicket = m_trade.ResultDeal();
            ulong orderTicket = m_trade.ResultOrder();
            ulong finalTicket = orderTicket > 0 ? orderTicket : dealTicket;
            int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
            success = true;
            string typeStr = (orderType == "LIMIT" || orderType == "STOP") ? (orderType + " " + side) : ("Market " + side);
            msg = typeStr + " " + DoubleToString(volume, 2) + " " + symbol + " placed (Ticket #" + IntegerToString(finalTicket) + ") @ " + DoubleToString(m_trade.ResultPrice(), digits);
            Print("[SetupMint] ⚡ OPEN_ORDER SUCCESS: ", msg);
         }
         else
         {
            success = false;
            msg = "OPEN_ORDER failed: " + IntegerToString(GetLastError()) + " - " + m_trade.ResultRetcodeDescription();
            Print("[SetupMint] ❌ OPEN_ORDER FAILED - ", msg);
         }
      }
      else if(action == "MODIFY_SL")
      {
         if(PositionSelectByTicket(ticket))
         {
            double curTp = tp > 0 ? tp : PositionGetDouble(POSITION_TP);
            ResetLastError();
            bool modRes = m_trade.PositionModify(ticket, sl, curTp);
            uint retcode = m_trade.ResultRetcode();
            if(modRes || retcode == 10025 || retcode == 10009)
            {
               success = true;
               msg = "Stop Loss modified to " + DoubleToString(sl, 2);
               Print("[SetupMint] ⚡ PositionModify SUCCESS on Ticket #", ticket, " -> SL: ", sl);
            }
            else
            {
               success = false;
               msg = "PositionModify failed: " + IntegerToString(GetLastError()) + " (retcode " + IntegerToString(retcode) + ") - " + m_trade.ResultRetcodeDescription();
               Print("[SetupMint] ❌ PositionModify FAILED on Ticket #", ticket, " - ", msg);
            }
         }
         else
         {
            success = false;
            msg = "Position ticket #" + IntegerToString(ticket) + " not found or already closed";
            Print("[SetupMint] ⚠️ ", msg);
         }
      }
      else if(action == "MODIFY_TP")
      {
         if(PositionSelectByTicket(ticket))
         {
            double curSl = sl > 0 ? sl : PositionGetDouble(POSITION_SL);
            double newTp = tp; // In MT5, 0.0 clears TP completely for runner mode
            ResetLastError();
            bool modRes = m_trade.PositionModify(ticket, curSl, newTp);
            uint retcode = m_trade.ResultRetcode();
            if(modRes || retcode == 10025 || retcode == 10009)
            {
               success = true;
               msg = (newTp <= 0.0) ? "Take Profit removed (open runner)" : ("Take Profit modified to " + DoubleToString(newTp, 2));
               Print("[SetupMint] ⚡ PositionModify TP SUCCESS on Ticket #", ticket, " -> TP: ", newTp);
            }
            else
            {
               success = false;
               msg = "PositionModify TP failed: " + IntegerToString(GetLastError()) + " (retcode " + IntegerToString(retcode) + ") - " + m_trade.ResultRetcodeDescription();
               Print("[SetupMint] ❌ PositionModify TP FAILED on Ticket #", ticket, " - ", msg);
            }
         }
         else
         {
            success = false;
            msg = "Position ticket #" + IntegerToString(ticket) + " not found or already closed";
            Print("[SetupMint] ⚠️ ", msg);
         }
      }
      else if(action == "CLOSE_POSITION")
      {
         if(PositionSelectByTicket(ticket))
         {
            double openVol = PositionGetDouble(POSITION_VOLUME);
            double closeVol = (volume > 0 && volume < openVol) ? volume : openVol;

            success = ClosePositionByTicket(ticket, closeVol, msg);
            if(success)
            {
               Print("[SetupMint] ⚡ PositionClose SUCCESS on Ticket #", ticket, " -> ", msg);
            }
            else
            {
               Print("[SetupMint] ❌ PositionClose FAILED on Ticket #", ticket, " - ", msg);
            }
         }
         else
         {
            success = false;
            msg = "Position ticket #" + IntegerToString(ticket) + " not found or already closed";
            Print("[SetupMint] ⚠️ ", msg);
         }
      }
      else if(action == "CAPTURE_SCREENSHOT")
      {
         string shotSym = ExtractJsonString(cmdObj, "symbol");
         Print("[SetupMint] 📸 CAPTURE_SCREENSHOT command received from SetupMint for ticket #", ticket);
         success = CaptureAndSendScreenshot(ticket, "MANUAL", shotSym);
         msg = success ? "MT5 chart screenshot captured and uploaded" : "Chart screenshot capture failed";
      }
      
      if(StringLen(commandId) > 0)
      {
         if(executedCount > 0) resultsJson += ",";
         resultsJson += "{\"commandId\":\"" + commandId + "\",\"status\":\"" + (success ? "SUCCESS" : "FAILED") + "\",\"message\":\"" + msg + "\"}";
         executedCount++;
      }
   }
   
   if(executedCount > 0)
   {
      // Acknowledge command results to SetupMint without re-processing commands
      string ackPayload = "{\"token\":\"" + InpToken + "\",\"commandResults\":[" + resultsJson + "]}";
      SendJsonToSetupMint(ackPayload, false);
      
      // Immediately refresh active positions and deal history
      SyncAllActivePositions();
      CheckClosedDeals();
   }
}

//+------------------------------------------------------------------+
//| Sync all active open positions & live market quotes              |
//+------------------------------------------------------------------+
void SyncAllActivePositions()
{
   int total = PositionsTotal();
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);

   string json = "{\"token\":\"" + InpToken + "\",\"balance\":" + DoubleToString(balance, 2) + ",\"equity\":" + DoubleToString(equity, 2);

   // Collect unique symbols: current chart symbol + core assets + open position symbols (up to 16)
   string trackedSymbols[16];
   int trackedCount = 0;
   trackedSymbols[trackedCount++] = _Symbol;

   // Always track Gold and Ethereum for real-time Telegram Cockpit & 1-tap orders
   string coreSymbols[] = {"XAUUSD", "ETHUSD"};
   for(int c = 0; c < 2 && trackedCount < 16; c++)
   {
      string cs = coreSymbols[c];
      bool exists = false;
      for(int s = 0; s < trackedCount; s++)
      {
         if(trackedSymbols[s] == cs) { exists = true; break; }
      }
      if(!exists)
      {
         SymbolSelect(cs, true);
         trackedSymbols[trackedCount++] = cs;
      }
   }
   for(int i = 0; i < total && trackedCount < 16; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string psym = PositionGetString(POSITION_SYMBOL);
         bool exists = false;
         for(int s = 0; s < trackedCount; s++)
         {
            if(trackedSymbols[s] == psym) { exists = true; break; }
         }
         if(!exists) trackedSymbols[trackedCount++] = psym;
      }
   }

   // 1. Live market quotes block (exact broker bid/ask/ltp)
   json += ",\"quotes\":[";
   for(int s = 0; s < trackedCount; s++)
   {
      string qsym = trackedSymbols[s];
      double qBid = SymbolInfoDouble(qsym, SYMBOL_BID);
      double qAsk = SymbolInfoDouble(qsym, SYMBOL_ASK);
      double qLtp = qBid > 0 ? qBid : qAsk;
      int qDigits = (int)SymbolInfoInteger(qsym, SYMBOL_DIGITS);
      if(qDigits <= 0) qDigits = 2;

      if(s > 0) json += ",";
      json += "{";
      json += "\"symbol\":\"" + qsym + "\",";
      json += "\"bid\":" + DoubleToString(qBid, qDigits) + ",";
      json += "\"ask\":" + DoubleToString(qAsk, qDigits) + ",";
      json += "\"ltp\":" + DoubleToString(qLtp, qDigits) + ",";
      json += "\"time\":\"" + FormatIsoUtc(TimeCurrent()) + "\"";
      json += "}";
   }
   json += "],\"positions\":[";

   // 2. Open positions block with live cur_price, bid, and ask
   int added = 0;
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string sym = PositionGetString(POSITION_SYMBOL);

         // Auto-capture chart screenshot on position open
         if(InpAutoCaptureScreenshots && !HasCapturedEntryScreenshot(ticket))
         {
            MarkEntryScreenshotCaptured(ticket);
            CaptureAndSendScreenshot(ticket, "ENTRY", sym);
         }
         ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         double vol = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double curPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
         double posBid = SymbolInfoDouble(sym, SYMBOL_BID);
         double posAsk = SymbolInfoDouble(sym, SYMBOL_ASK);
         int posDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         if(posDigits <= 0) posDigits = 2;

         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
         double profit = PositionGetDouble(POSITION_PROFIT);
         double swap = PositionGetDouble(POSITION_SWAP);
         ulong posId = (ulong)PositionGetInteger(POSITION_IDENTIFIER);

         int trackerIdx = -1;
         for(int k = 0; k < g_excursionCount; k++)
         {
            if(g_excursions[k].ticket == ticket) { trackerIdx = k; break; }
         }

         if(added > 0) json += ",";
         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         if(posId > 0 && posId != ticket)
         {
            json += "\"id\":\"" + IntegerToString(posId) + "\",";
         }
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"type\":\"" + (type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
         json += "\"volume\":" + DoubleToString(vol, 2) + ",";
         json += "\"price\":" + DoubleToString(openPrice, posDigits) + ",";
         json += "\"cur_price\":" + DoubleToString(curPrice, posDigits) + ",";
         json += "\"bid\":" + DoubleToString(posBid, posDigits) + ",";
         json += "\"ask\":" + DoubleToString(posAsk, posDigits) + ",";
         json += "\"sl\":" + DoubleToString(sl, posDigits) + ",";
         json += "\"tp\":" + DoubleToString(tp, posDigits) + ",";
         json += "\"profit\":" + DoubleToString(profit, 2) + ",";
         json += "\"swap\":" + DoubleToString(swap, 2) + ",";
         json += "\"open_time\":\"" + FormatIsoUtc(openTime) + "\"";
         if(trackerIdx >= 0)
         {
            json += ",\"mfe_price\":" + DoubleToString(g_excursions[trackerIdx].peakPrice, posDigits);
            json += ",\"mae_price\":" + DoubleToString(g_excursions[trackerIdx].worstPrice, posDigits);
            json += ",\"peak_profit\":" + DoubleToString(g_excursions[trackerIdx].peakProfit, 2);
            json += ",\"max_drawdown\":" + DoubleToString(g_excursions[trackerIdx].maxDrawdown, 2);
         }
         json += "}";
         added++;
      }
   }

   // Safety Fallback: If PositionsTotal() is 0 but we have active positions tracked in g_excursions,
   // verify them directly with PositionSelectByTicket to guarantee zero false empty payloads during order updates
   if(added == 0 && g_excursionCount > 0)
   {
      for(int k = 0; k < g_excursionCount; k++)
      {
         ulong exTicket = g_excursions[k].ticket;
         if(exTicket > 0 && PositionSelectByTicket(exTicket))
         {
            string sym = PositionGetString(POSITION_SYMBOL);
            ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
            double vol = PositionGetDouble(POSITION_VOLUME);
            double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
            double curPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
            double posBid = SymbolInfoDouble(sym, SYMBOL_BID);
            double posAsk = SymbolInfoDouble(sym, SYMBOL_ASK);
            int posDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
            if(posDigits <= 0) posDigits = 2;
            double sl = PositionGetDouble(POSITION_SL);
            double tp = PositionGetDouble(POSITION_TP);
            datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
            double profit = PositionGetDouble(POSITION_PROFIT);
            double swap = PositionGetDouble(POSITION_SWAP);
            ulong posId = (ulong)PositionGetInteger(POSITION_IDENTIFIER);

            if(added > 0) json += ",";
            json += "{";
            json += "\"ticket\":" + IntegerToString(exTicket) + ",";
            if(posId > 0 && posId != exTicket)
            {
               json += "\"id\":\"" + IntegerToString(posId) + "\",";
            }
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"type\":\"" + (type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
            json += "\"volume\":" + DoubleToString(vol, 2) + ",";
            json += "\"price\":" + DoubleToString(openPrice, posDigits) + ",";
            json += "\"cur_price\":" + DoubleToString(curPrice, posDigits) + ",";
            json += "\"bid\":" + DoubleToString(posBid, posDigits) + ",";
            json += "\"ask\":" + DoubleToString(posAsk, posDigits) + ",";
            json += "\"sl\":" + DoubleToString(sl, posDigits) + ",";
            json += "\"tp\":" + DoubleToString(tp, posDigits) + ",";
            json += "\"profit\":" + DoubleToString(profit, 2) + ",";
            json += "\"swap\":" + DoubleToString(swap, 2) + ",";
            json += "\"open_time\":\"" + FormatIsoUtc(openTime) + "\"";
            json += ",\"mfe_price\":" + DoubleToString(g_excursions[k].peakPrice, posDigits);
            json += ",\"mae_price\":" + DoubleToString(g_excursions[k].worstPrice, posDigits);
            json += ",\"peak_profit\":" + DoubleToString(g_excursions[k].peakProfit, 2);
            json += ",\"max_drawdown\":" + DoubleToString(g_excursions[k].maxDrawdown, 2);
            json += "}";
            added++;
         }
      }
   }
   json += "]}";

   SendJsonToSetupMint(json, true);
}

//+------------------------------------------------------------------+
//| Check recently closed orders from Deal History                   |
//+------------------------------------------------------------------+
void CheckClosedDeals()
{
   datetime now = TimeCurrent();
   datetime fromTime = lastHistoryCheckTime > 0 ? (lastHistoryCheckTime - 30) : (now - 600);
   
   if(!HistorySelect(fromTime, now)) return;
   
   // 1. Collect closed deals first so subsequent HistorySelectByPosition does not invalidate the buffer
   ulong closedDeals[];
   int closedCount = 0;
   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket > 0 && !IsDealProcessed(dealTicket))
      {
         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY) // Position closed or reversed
         {
            ArrayResize(closedDeals, closedCount + 1);
            closedDeals[closedCount++] = dealTicket;
         }
      }
   }

   for(int i = 0; i < closedCount; i++)
   {
      ulong dealTicket = closedDeals[i];
      if(IsDealProcessed(dealTicket)) continue;
      MarkDealProcessed(dealTicket);

      if(!HistoryDealSelect(dealTicket)) continue;

      ulong posTicket = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      double vol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double fee = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

            // 1. Retrieve true opening deal & price for this position
            datetime openTime = 0;
            double openPrice = 0;
            if(posTicket > 0 && HistorySelectByPosition(posTicket))
            {
               int posDeals = HistoryDealsTotal();
               for(int k = 0; k < posDeals; k++)
               {
                  ulong d = HistoryDealGetTicket(k);
                  if(d > 0 && (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_IN)
                  {
                     openTime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
                     openPrice = HistoryDealGetDouble(d, DEAL_PRICE);
                     break;
                  }
               }
            }
            if(openTime <= 0) openTime = closeTime > 60 ? (closeTime - 60) : closeTime;
            if(openPrice <= 0) openPrice = closePrice;

            // 2. Retrieve live tracked excursion data
            double trackedPeakPrice = 0;
            double trackedWorstPrice = 0;
            double trackedPeakProfit = profit;
            double trackedMaxDrawdown = profit;
            bool hasTracker = false;
            for(int k = 0; k < g_excursionCount; k++)
            {
               if(g_excursions[k].ticket == posTicket)
               {
                  trackedPeakPrice = g_excursions[k].peakPrice;
                  trackedWorstPrice = g_excursions[k].worstPrice;
                  trackedPeakProfit = g_excursions[k].peakProfit;
                  trackedMaxDrawdown = g_excursions[k].maxDrawdown;
                  hasTracker = true;
                  // Remove completed position from tracker array
                  for(int m = k; m < g_excursionCount - 1; m++)
                  {
                     g_excursions[m] = g_excursions[m + 1];
                  }
                  g_excursionCount--;
                  break;
               }
            }

            // 3. Broker chart M1 candle bar confirmation (handles restarts & intermediate wicks)
            double highs[];
            double lows[];
            ArraySetAsSeries(highs, false);
            ArraySetAsSeries(lows, false);
            int countH = CopyHigh(sym, PERIOD_M1, openTime, closeTime, highs);
            int countL = CopyLow(sym, PERIOD_M1, openTime, closeTime, lows);
            double barHigh = 0;
            double barLow = 0;
            if(countH > 0 && countL > 0)
            {
               barHigh = highs[ArrayMaximum(highs)];
               barLow = lows[ArrayMinimum(lows)];
            }

            // 4. Resolve definitive broker MFE and MAE
            bool isBuyPosition = (dealType == DEAL_TYPE_SELL); // Deal OUT was SELL -> Position was BUY
            double finalMfePrice = closePrice;
            double finalMaePrice = closePrice;

            if(isBuyPosition)
            {
               // BUY (LONG): High is favorable, Low is adverse
               finalMfePrice = MathMax(openPrice, closePrice);
               if(barHigh > finalMfePrice) finalMfePrice = barHigh;
               if(hasTracker && trackedPeakPrice > finalMfePrice) finalMfePrice = trackedPeakPrice;

               finalMaePrice = MathMin(openPrice, closePrice);
               if(barLow > 0 && barLow < finalMaePrice) finalMaePrice = barLow;
               if(hasTracker && trackedWorstPrice > 0 && trackedWorstPrice < finalMaePrice) finalMaePrice = trackedWorstPrice;
            }
            else
            {
               // SELL (SHORT): Low is favorable, High is adverse
               finalMfePrice = MathMin(openPrice, closePrice);
               if(barLow > 0 && barLow < finalMfePrice) finalMfePrice = barLow;
               if(hasTracker && trackedPeakPrice > 0 && trackedPeakPrice < finalMfePrice) finalMfePrice = trackedPeakPrice;

               finalMaePrice = MathMax(openPrice, closePrice);
               if(barHigh > finalMaePrice) finalMaePrice = barHigh;
               if(hasTracker && trackedWorstPrice > finalMaePrice) finalMaePrice = trackedWorstPrice;
            }

            double finalPeakProfit = MathMax(profit, hasTracker ? trackedPeakProfit : profit);
            if(profit > 0) finalPeakProfit = MathMax(finalPeakProfit, profit);

            double finalMaxDrawdown = MathMin(profit, hasTracker ? trackedMaxDrawdown : profit);
            if(profit < 0) finalMaxDrawdown = MathMin(finalMaxDrawdown, profit);

            string json = "{";
            json += "\"token\":\"" + InpToken + "\",";
            json += "\"action\":\"CLOSE\",";
            json += "\"ticket\":" + IntegerToString(posTicket > 0 ? posTicket : dealTicket) + ",";
            json += "\"deal_id\":" + IntegerToString(dealTicket) + ",";
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"type\":\"" + (isBuyPosition ? "BUY" : "SELL") + "\",";
            json += "\"volume\":" + DoubleToString(vol, 2) + ",";
            json += "\"open_price\":" + DoubleToString(openPrice, 5) + ",";
            json += "\"close_price\":" + DoubleToString(closePrice, 5) + ",";
            json += "\"profit\":" + DoubleToString(profit, 2) + ",";
            json += "\"commission\":" + DoubleToString(fee, 2) + ",";
            json += "\"swap\":" + DoubleToString(swap, 2) + ",";
            json += "\"open_time\":\"" + FormatIsoUtc(openTime) + "\",";
            json += "\"close_time\":\"" + FormatIsoUtc(closeTime) + "\",";
            json += "\"mfe_price\":" + DoubleToString(finalMfePrice, 5) + ",";
            json += "\"mae_price\":" + DoubleToString(finalMaePrice, 5) + ",";
            json += "\"peak_profit\":" + DoubleToString(finalPeakProfit, 2) + ",";
            json += "\"max_drawdown\":" + DoubleToString(finalMaxDrawdown, 2);
            json += "}";

            SendJsonToSetupMint(json, false);

            // Auto-capture chart screenshot on position close
            if(InpAutoCaptureScreenshots)
            {
               CaptureAndSendScreenshot(posTicket > 0 ? posTicket : dealTicket, "EXIT", sym);
            }
   }
   lastHistoryCheckTime = now;
}

//+------------------------------------------------------------------+
//| Force-sync all today's closed deals from MT5 Deal History        |
//+------------------------------------------------------------------+
void SyncAllTodayClosedDeals()
{
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime startOfDay = StructToTime(dt);
   datetime fromTime = (now - 86400) < startOfDay ? (now - 86400) : startOfDay;

   Print("[SetupMint] ⚡ Querying all closed deals since ", TimeToString(fromTime), "...");
   lastHistoryCheckTime = fromTime;
   CheckClosedDeals();
}

//+------------------------------------------------------------------+
//| Create visual 1-click sync button on MT5 chart                   |
//+------------------------------------------------------------------+
void CreateOnChartSyncButton()
{
   string btnName = "SetupMint_SyncBtn";
   ObjectDelete(0, btnName);
   if(ObjectCreate(0, btnName, OBJ_BUTTON, 0, 0, 0))
   {
      ObjectSetInteger(0, btnName, OBJPROP_XDISTANCE, 20);
      ObjectSetInteger(0, btnName, OBJPROP_YDISTANCE, 50);
      ObjectSetInteger(0, btnName, OBJPROP_XSIZE, 175);
      ObjectSetInteger(0, btnName, OBJPROP_YSIZE, 32);
      ObjectSetString(0, btnName, OBJPROP_TEXT, "⚡ Sync SetupMint");
      ObjectSetString(0, btnName, OBJPROP_FONT, "Segoe UI");
      ObjectSetInteger(0, btnName, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, btnName, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, btnName, OBJPROP_BGCOLOR, C'34,197,94'); // Green
      ObjectSetInteger(0, btnName, OBJPROP_BORDER_COLOR, C'22,163,74');
      ObjectSetInteger(0, btnName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, btnName, OBJPROP_SELECTABLE, false);
      ChartRedraw(0);
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[SetupMint] Initializing SetupMint Elefin MT5 2-Way Execution Bridge EA v2.30 (Resilient Partial Execution Engine)...");
   m_trade.SetExpertMagicNumber(1998);
   m_trade.SetDeviationInPoints(30);
   m_trade.SetMarginMode();

   EventSetTimer(InpSyncTimerSec);
   
   // Query and sync all today's deals upon start/restart (ensures zero missed trades)
   SyncAllTodayClosedDeals();
   
   // Create on-chart 1-Click Sync Button
   CreateOnChartSyncButton();
   
   // Ping SetupMint server
   string pingJson = "{\"token\":\"" + InpToken + "\",\"action\":\"PING\"}";
   SendJsonToSetupMint(pingJson, true);
   
   // Initial excursion tracking & sync
   UpdateExcursionTracking();
   SyncAllActivePositions();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectDelete(0, "SetupMint_SyncBtn");
   Print("[SetupMint] SetupMint Bridge EA stopped.");
}

//+------------------------------------------------------------------+
//| Expert tick function (Instant High-Precision Excursion Tracking) |
//+------------------------------------------------------------------+
void OnTick()
{
   UpdateExcursionTracking();
}

//+------------------------------------------------------------------+
//| Expert trade transaction function (Instant Execution Event)      |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   // Only trigger instant sync on real deal execution (entry/exit) or position modification (SL/TP adjusted).
   // CRITICAL: NEVER sync on TRADE_TRANSACTION_ORDER_DELETE!
   // When modifying Stop Loss or Take Profit on MT5 (mobile or desktop), MT5 deletes the old SL order structure
   // before registering the new one. Triggering a position sync during ORDER_DELETE occurs while the terminal
   // is in a transient order-updating state where PositionsTotal() can temporarily return 0, leading to false
   // auto-closure of open positions.
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD ||
      trans.type == TRADE_TRANSACTION_POSITION)
   {
      UpdateExcursionTracking();
      SyncAllActivePositions();
      CheckClosedDeals();
   }
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   UpdateExcursionTracking();
   SyncAllActivePositions();
   CheckClosedDeals();
}

//+------------------------------------------------------------------+
//| Chart Event handler (1-Click On-Chart Sync Button)               |
//+------------------------------------------------------------------+
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == "SetupMint_SyncBtn")
   {
      Print("[SetupMint] ⚡ User clicked On-Chart 'Sync SetupMint' button! Syncing all today's deals & positions...");
      SyncAllTodayClosedDeals();
      SyncAllActivePositions();
      ObjectSetInteger(0, "SetupMint_SyncBtn", OBJPROP_STATE, false);
      ChartRedraw(0);
   }
}
//+------------------------------------------------------------------+
