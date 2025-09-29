==============================================
NETWITNESS MCP SERVER VERSION INFORMATION
==============================================
This directory contains two distinct Docker image versions for the NetWitness MCP Server. Please select the appropriate image based on
where your client application will be running relative to the server.

----------------------------------------------
1. LOCAL SERVER VERSION (Same Host)
----------------------------------------------

Image Name: netwitness-mcp-local-server

Use Case: This version is intended for scenarios where the client application (e.g., Claude Desktop) runs on the SAME HOST MACHINE as
the NetWitness MCP Docker server.


----------------------------------------------
2. REMOTE SERVER VERSION (Different Hosts)
----------------------------------------------

Image Name: netwitness-mcp-remote-server

Use Case: This version is intended for scenarios where the client application runs on a DIFFERENT HOST MACHINE than the NetWitness
MCP Docker server.


----------------------------------------------
SUMMARY
----------------------------------------------
Use the -local- server image if the client and server are on the same machine.
Use the -remote- server image if the client and server are on separate machines.
