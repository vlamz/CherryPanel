package api

import (
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
	"github.com/pufferpanel/pufferpanel/v3/middleware"
	"github.com/pufferpanel/pufferpanel/v3/response"
	"github.com/pufferpanel/pufferpanel/v3/scopes"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/disk"
	"github.com/shirou/gopsutil/mem"
	psnet "github.com/shirou/gopsutil/net"
)

type systemStatsResponse struct {
	CPU     float64      `json:"cpu"`
	Memory  memoryStats  `json:"memory"`
	Disk    diskStats    `json:"disk"`
	Network networkStats `json:"network"`
}

type memoryStats struct {
	Used    uint64  `json:"used"`
	Total   uint64  `json:"total"`
	Percent float64 `json:"percent"`
}

type diskStats struct {
	Used    uint64  `json:"used"`
	Total   uint64  `json:"total"`
	Percent float64 `json:"percent"`
}

type networkStats struct {
	BytesSent uint64 `json:"bytesSent"`
	BytesRecv uint64 `json:"bytesRecv"`
}

func registerSystemStats(g *gin.RouterGroup) {
	g.Handle("GET", "", middleware.RequiresPermission(scopes.ScopeNodesView), getSystemStats)
	g.Handle("OPTIONS", "", response.CreateOptions("GET"))
}

// @Summary Get host system stats
// @Description Returns CPU, memory, and disk usage for the panel host machine
// @Success 200 {object} systemStatsResponse
// @Failure 403 {object} pufferpanel.ErrorResponse
// @Failure 500 {object} pufferpanel.ErrorResponse
// @Router /api/nodes/system [get]
// @Security OAuth2Application[nodes.view]
func getSystemStats(c *gin.Context) {
	cpuPercents, err := cpu.Percent(0, false)
	cpuVal := 0.0
	if err == nil && len(cpuPercents) > 0 {
		cpuVal = cpuPercents[0]
	}

	memStat, err := mem.VirtualMemory()
	if response.HandleError(c, err, http.StatusInternalServerError) {
		return
	}

	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	}
	diskStat, err := disk.Usage(diskPath)
	if err != nil {
		diskStat = &disk.UsageStat{}
	}

	netCounters, err := psnet.IOCounters(false)
	netVal := networkStats{}
	if err == nil && len(netCounters) > 0 {
		netVal = networkStats{
			BytesSent: netCounters[0].BytesSent,
			BytesRecv: netCounters[0].BytesRecv,
		}
	}

	c.JSON(http.StatusOK, systemStatsResponse{
		CPU: cpuVal,
		Memory: memoryStats{
			Used:    memStat.Used,
			Total:   memStat.Total,
			Percent: memStat.UsedPercent,
		},
		Disk: diskStats{
			Used:    diskStat.Used,
			Total:   diskStat.Total,
			Percent: diskStat.UsedPercent,
		},
		Network: netVal,
	})
}
