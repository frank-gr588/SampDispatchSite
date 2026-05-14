using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace SaMapViewer.Hubs
{
    /// <summary>
    /// Real-time hub for broadcasting player/unit/situation updates to all connected clients.
    /// Clients join a single group "dashboard" and receive all broadcasts.
    /// </summary>
    public class CoordsHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "dashboard");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "dashboard");
            await base.OnDisconnectedAsync(exception);
        }
    }
}