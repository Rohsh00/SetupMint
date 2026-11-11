//+------------------------------------------------------------------+
//|                                     SetupMint_Elefin_Bridge.mq5  |
//|               Copyright 2026, SetupMint Trading Analytics Engine  |
//|                                      https://setupmint.com       |
//+------------------------------------------------------------------+
#property copyright   "SetupMint"
#property link        "https://setupmint.com"
#property version     "2.00"
#property description "Automated Real-Time 2-Way Execution & Live Trade Sync Bridge for SetupMint"
#property strict

#include <Trade\Trade.mqh>

//--- Input parameters
input string   InpSetupMintUrl = "http://13.205.58.162/api/v1/integrations/mt5/webhook"; // SetupMint Webhook URL
input string   InpToken        = "6af1fa0735d0f0f584d918bf"; // Account Webhook Token (or 'elefin')
input int      InpSyncTimerSec = 3;                           // Periodic Sync Interval (Seconds)

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
      
      if((ticket <= 0 && action != "FETCH_HISTORY") || StringLen(action) == 0) continue;
      
      bool success = false;
      string msg = "";
      
      if(action == "FETCH_HISTORY")
      {
         Print("[SetupMint] ⚡ FETCH_HISTORY command received from SetupMint! Syncing all today's closed deals...");
         SyncAllTodayClosedDeals();
         success = true;
         msg = "All today's deals pushed to SetupMint";
      }
      else if(action == "MODIFY_SL")
      {
         if(PositionSelectByTicket(ticket))
         {
            double curTp = tp > 0 ? tp : PositionGetDouble(POSITION_TP);
            ResetLastError();
            if(m_trade.PositionModify(ticket, sl, curTp))
            {
               success = true;
               msg = "Stop Loss modified to " + DoubleToString(sl, 2);
               Print("[SetupMint] ⚡ PositionModify SUCCESS on Ticket #", ticket, " -> SL: ", sl);
            }
            else
            {
               success = false;
               msg = "PositionModify failed: " + IntegerToString(GetLastError()) + " - " + m_trade.ResultRetcodeDescription();
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
      else if(action == "CLOSE_POSITION")
      {
         if(PositionSelectByTicket(ticket))
         {
            ResetLastError();
            bool closeRes = false;
            double openVol = PositionGetDouble(POSITION_VOLUME);
            if(volume > 0 && volume < openVol)
            {
               closeRes = m_trade.PositionClosePartial(ticket, volume);
            }
            else
            {
               closeRes = m_trade.PositionClose(ticket);
            }
            
            if(closeRes)
            {
               success = true;
               msg = "Position closed successfully";
               Print("[SetupMint] ⚡ PositionClose SUCCESS on Ticket #", ticket);
            }
            else
            {
               success = false;
               msg = "PositionClose failed: " + IntegerToString(GetLastError()) + " - " + m_trade.ResultRetcodeDescription();
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
//| Sync all active open positions                                   |
//+------------------------------------------------------------------+
void SyncAllActivePositions()
{
   int total = PositionsTotal();
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);

   string json = "{\"token\":\"" + InpToken + "\",\"balance\":" + DoubleToString(balance, 2) + ",\"equity\":" + DoubleToString(equity, 2) + ",\"positions\":[";
   
   int added = 0;
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string sym = PositionGetString(POSITION_SYMBOL);
         ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         double vol = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
         double profit = PositionGetDouble(POSITION_PROFIT);
         double swap = PositionGetDouble(POSITION_SWAP);

         int trackerIdx = -1;
         for(int k = 0; k < g_excursionCount; k++)
         {
            if(g_excursions[k].ticket == ticket) { trackerIdx = k; break; }
         }

         if(added > 0) json += ",";
         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"type\":\"" + (type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
         json += "\"volume\":" + DoubleToString(vol, 2) + ",";
         json += "\"price\":" + DoubleToString(openPrice, 5) + ",";
         json += "\"sl\":" + DoubleToString(sl, 5) + ",";
         json += "\"tp\":" + DoubleToString(tp, 5) + ",";
         json += "\"profit\":" + DoubleToString(profit, 2) + ",";
         json += "\"swap\":" + DoubleToString(swap, 2) + ",";
         json += "\"open_time\":\"" + FormatIsoUtc(openTime) + "\"";
         if(trackerIdx >= 0)
         {
            json += ",\"mfe_price\":" + DoubleToString(g_excursions[trackerIdx].peakPrice, 5);
            json += ",\"mae_price\":" + DoubleToString(g_excursions[trackerIdx].worstPrice, 5);
            json += ",\"peak_profit\":" + DoubleToString(g_excursions[trackerIdx].peakProfit, 2);
            json += ",\"max_drawdown\":" + DoubleToString(g_excursions[trackerIdx].maxDrawdown, 2);
         }
         json += "}";
         added++;
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
   Print("[SetupMint] Initializing SetupMint Elefin MT5 2-Way Execution Bridge EA v2.20 (Zero-Discrepancy Engine)...");
   m_trade.SetExpertMagicNumber(1998);
   m_trade.SetDeviationInPoints(30);

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
   // When a deal or order executes, trigger instant sync
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD ||
      trans.type == TRADE_TRANSACTION_ORDER_DELETE ||
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
