namespace SaMapViewer.Services
{
    public class SaOptions
    {
        public string ApiKey { get; set; } = string.Empty;
        public int PlayerTtlSeconds { get; set; } = 30;
        public string DatabasePath { get; set; } = "samap.db";
    }
}
