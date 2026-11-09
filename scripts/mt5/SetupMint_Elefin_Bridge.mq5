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

// Forward declarations
void ProcessSetupMintCommands(string responseJson);
void SyncAllActivePositions();
void CheckClosedDeals();

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
      
      if(ticket <= 0 || StringLen(action) == 0) continue;
      
      bool success = false;
      string msg = "";
      
      if(action == "MODIFY_SL")
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
         json += "\"open_time\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\"";
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
   datetime fromTime = lastHistoryCheckTime > 0 ? lastHistoryCheckTime : (now - 300);
   
   if(!HistorySelect(fromTime, now)) return;
   
   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket > 0)
      {
         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT) // Position closed or reversed
         {
            ulong posTicket = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
            string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
            ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
            double vol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
            double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
            double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
            double fee = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
            double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
            datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

            string json = "{";
            json += "\"token\":\"" + InpToken + "\",";
            json += "\"action\":\"CLOSE\",";
            json += "\"ticket\":" + IntegerToString(posTicket > 0 ? posTicket : dealTicket) + ",";
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"type\":\"" + (dealType == DEAL_TYPE_SELL ? "BUY" : "SELL") + "\","; // Closed opposite side
            json += "\"volume\":" + DoubleToString(vol, 2) + ",";
            json += "\"close_price\":" + DoubleToString(closePrice, 5) + ",";
            json += "\"profit\":" + DoubleToString(profit, 2) + ",";
            json += "\"commission\":" + DoubleToString(fee, 2) + ",";
            json += "\"swap\":" + DoubleToString(swap, 2) + ",";
            json += "\"close_time\":\"" + TimeToString(closeTime, TIME_DATE|TIME_SECONDS) + "\"";
            json += "}";

            SendJsonToSetupMint(json, false);
         }
      }
   }
   lastHistoryCheckTime = now;
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[SetupMint] Initializing SetupMint Elefin MT5 2-Way Execution Bridge EA v2.00...");
   m_trade.SetExpertMagicNumber(1998);
   m_trade.SetDeviationInPoints(30);

   EventSetTimer(InpSyncTimerSec);
   lastHistoryCheckTime = TimeCurrent() - 3600; // Look back 1 hour
   
   // Ping SetupMint server
   string pingJson = "{\"token\":\"" + InpToken + "\",\"action\":\"PING\"}";
   SendJsonToSetupMint(pingJson, true);
   
   // Initial sync
   SyncAllActivePositions();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("[SetupMint] SetupMint Bridge EA stopped.");
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
      SyncAllActivePositions();
      CheckClosedDeals();
   }
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   SyncAllActivePositions();
   CheckClosedDeals();
}
//+------------------------------------------------------------------+
