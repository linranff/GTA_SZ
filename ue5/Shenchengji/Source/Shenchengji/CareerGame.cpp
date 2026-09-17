#include "CareerGame.h"
#include <initializer_list>

void FShenchengjiCareerGame::BuildJobs()
{
	Jobs.Reset();
	auto Job = [this](const TCHAR* Id, const TCHAR* Role, const TCHAR* Title, const TCHAR* Person, const TCHAR* Mechanic, int32 Pay, std::initializer_list<FShenchengjiCareerObjective> Objectives, const TCHAR* Pickup, const TCHAR* Arrival)
	{
		FShenchengjiCareerJob Item;
		Item.Id = Id;
		Item.Role = Role;
		Item.Title = Title;
		Item.Person = Person;
		Item.Mechanic = Mechanic;
		Item.BasePay = Pay;
		Item.RequiredLevel = 1;
		Item.Objectives.Append(Objectives);
		Item.PickupLine = Pickup;
		Item.ArrivalLine = Arrival;
		Jobs.Add(Item);
	};

	Job(TEXT("hot-meal"), TEXT("day-worker"), TEXT("热饭趁热送"), TEXT("阿辉"), TEXT("delivery"), 190,
		{{TEXT("hub"), TEXT("海湾生活驿站 · 取餐"), TEXT("pickup"), 0.f}, {TEXT("bay"), TEXT("滨海路边交接点 · 送达热饭"), TEXT("dropoff"), 0.f}},
		TEXT("今天的饭还热着，别赶到危险，稳稳送过去。"), TEXT("刚好换班，饭也刚好到。辛苦，今天的工钱结了。"));
	Job(TEXT("two-stop-relay"), TEXT("day-worker"), TEXT("两站连送"), TEXT("阿辉"), TEXT("delivery"), 330,
		{{TEXT("hub"), TEXT("海湾生活驿站 · 领两份餐"), TEXT("pickup"), 0.f}, {TEXT("park"), TEXT("公园城市养护站 · 第一站"), TEXT("dropoff"), 0.f}, {TEXT("office"), TEXT("科苑下班驿站 · 最后一站"), TEXT("dropoff"), 0.f}},
		TEXT("两份一起跑，路线自己安排。别落下一份。"), TEXT("两边都收到了，下回有这样的单再叫你。"));
	Job(TEXT("quiet-ten-minutes"), TEXT("office"), TEXT("把十分钟还给自己"), TEXT("阿琳"), TEXT("comfort"), 230,
		{{TEXT("hub"), TEXT("海湾生活驿站 · 等阿琳下班"), TEXT("pickup"), 0.f}, {TEXT("bay"), TEXT("滨海路边交接点 · 留一点自己的时间"), TEXT("dropoff"), 0.f}},
		TEXT("今天开了六个会。我想听一会儿没有提示音的声音。"), TEXT("这一程真安静。原来今天还可以有这样的结尾。"));
	Job(TEXT("weekend-boundary"), TEXT("office"), TEXT("今天准点离开"), TEXT("阿琳"), TEXT("comfort"), 315,
		{{TEXT("office"), TEXT("科苑下班驿站 · 赴一个下班约"), TEXT("pickup"), 0.f}, {TEXT("park"), TEXT("公园城市养护站 · 今晚不加班"), TEXT("dropoff"), 0.f}},
		TEXT("说好了，这次不聊工作。你最近有什么开心的事？"), TEXT("下次见面，不一定还得用顺路当理由。"));
	Job(TEXT("after-rain-round"), TEXT("city-worker"), TEXT("雨后巡检"), TEXT("老陈"), TEXT("service"), 260,
		{{TEXT("hub"), TEXT("海湾生活驿站 · 领取巡检单"), TEXT("pickup"), 0.f}, {TEXT("bay"), TEXT("滨海路边交接点 · 检查接线"), TEXT("service"), 7.f}, {TEXT("park"), TEXT("公园城市养护站 · 清理落叶"), TEXT("service"), 9.f}},
		TEXT("雨刚停，灯和排水都得看一眼。我们做完，夜路就安心了。"), TEXT("两处都正常。你看这片灯亮起来，心里就踏实。"));
	Job(TEXT("night-repair"), TEXT("city-worker"), TEXT("城市亮灯之前"), TEXT("老陈"), TEXT("service"), 350,
		{{TEXT("workshop"), TEXT("公园城市养护站 · 领取备用设备"), TEXT("pickup"), 0.f}, {TEXT("park"), TEXT("公园城市养护站 · 检修灯组"), TEXT("service"), 11.f}, {TEXT("office"), TEXT("科苑下班驿站 · 更换接头"), TEXT("service"), 10.f}},
		TEXT("趁大家还没下班，把路灯亮起来。工具都点齐了吧？"), TEXT("这一片交差了。走，回驿站喝口热的。"));
}

void FShenchengjiCareerGame::BindPlaces(const TMap<FString, FShenchengjiGamePoint>& InPlaces)
{
	Places = InPlaces;
	BuildJobs();
}

const FShenchengjiGamePoint* FShenchengjiCareerGame::PlaceOf(const FString& Id) const
{
	return Places.Find(Id);
}

FString FShenchengjiCareerGame::ActiveTitle() const
{
	return HasActive() ? Jobs[ActiveIndex].Title : FString();
}

FString FShenchengjiCareerGame::ActiveObjective() const
{
	return HasActive() ? Jobs[ActiveIndex].Objectives[ObjectiveIndex].Label : FString();
}

FString FShenchengjiCareerGame::ActivePlaceId() const
{
	return HasActive() ? Jobs[ActiveIndex].Objectives[ObjectiveIndex].PlaceId : FString();
}

bool FShenchengjiCareerGame::Accept(const FString& JobId, FString& OutMessage)
{
	if (HasActive())
	{
		OutMessage = TEXT("你还有一份进行中的合约，可以继续或先结束它。");
		return false;
	}
	const int32 Index = Jobs.IndexOfByPredicate([&](const FShenchengjiCareerJob& Job) { return Job.Id == JobId; });
	if (Index == INDEX_NONE)
	{
		OutMessage = TEXT("这份合约不存在。");
		return false;
	}
	ActiveIndex = Index;
	ObjectiveIndex = 0;
	Quality = 100.f;
	HoldSeconds = 0.f;
	HoldRequired = Jobs[Index].Objectives[0].HoldSeconds;
	Elapsed = 0.f;
	bInvalid = false;
	OutMessage = TEXT("已接下 · ") + Jobs[Index].Title;
	return true;
}

bool FShenchengjiCareerGame::Cancel(FString& OutMessage)
{
	if (!HasActive())
	{
		OutMessage = TEXT("目前没有进行中的合约。");
		return false;
	}
	ActiveIndex = -1;
	OutMessage = TEXT("本单已结束，没有扣款。随时可以重新接。");
	return true;
}

void FShenchengjiCareerGame::Tick(const FShenchengjiCareerFrame& Frame, float DeltaSeconds)
{
	if (!HasActive() || Frame.bPaused || bInvalid)
	{
		return;
	}
	if (DebugEpoch != 0 && Frame.DebugEpoch != DebugEpoch)
	{
		bInvalid = true;
		return;
	}
	DebugEpoch = Frame.DebugEpoch;
	if (ObjectiveIndex > 0)
	{
		Elapsed += DeltaSeconds;
		if (Jobs[ActiveIndex].Mechanic == TEXT("delivery") && Elapsed > 180.f)
		{
			Quality = FMath::Max(20.f, Quality - DeltaSeconds * 0.38f);
		}
	}
	const FShenchengjiGamePoint* Place = PlaceOf(ActivePlaceId());
	if (!Place)
	{
		return;
	}
	const double Distance = FMath::Sqrt(FMath::Square(Frame.X - Place->X) + FMath::Square(Frame.Z - Place->Z));
	HoldRequired = Jobs[ActiveIndex].Objectives[ObjectiveIndex].HoldSeconds;
	if (HoldRequired > 0.f && Distance < ArriveRadius && Frame.Speed < StopSpeed)
	{
		HoldSeconds = FMath::Min(HoldRequired, HoldSeconds + DeltaSeconds);
	}
	else if (HoldRequired > 0.f)
	{
		HoldSeconds = 0.f;
	}
}

bool FShenchengjiCareerGame::Interact(const FShenchengjiCareerFrame& Frame, TFunctionRef<bool(const FString&, int32)> Credit, FString& OutMessage)
{
	if (!HasActive())
	{
		OutMessage = TEXT("在生活手账中接一份合约，再来开始。");
		return false;
	}
	if (bInvalid)
	{
		OutMessage = TEXT("调试跳转不会结算工钱。请结束后重接。");
		return false;
	}
	const FShenchengjiCareerJob& Job = Jobs[ActiveIndex];
	const FShenchengjiCareerObjective& Objective = Job.Objectives[ObjectiveIndex];
	const FShenchengjiGamePoint* Place = PlaceOf(Objective.PlaceId);
	if (!Place)
	{
		OutMessage = TEXT("地点未配置。");
		return false;
	}
	const double Distance = FMath::Sqrt(FMath::Square(Frame.X - Place->X) + FMath::Square(Frame.Z - Place->Z));
	if (Distance >= ArriveRadius)
	{
		OutMessage = TEXT("再靠近交接点一些。");
		return false;
	}
	if (Frame.Speed >= StopSpeed)
	{
		OutMessage = TEXT("请先停稳，再交接。");
		return false;
	}
	if (HoldRequired > 0.f && HoldSeconds + 1e-3f < HoldRequired)
	{
		OutMessage = FString::Printf(TEXT("巡检还差 %.0f 秒，请保持停车。"), HoldRequired - HoldSeconds);
		return false;
	}
	if (ObjectiveIndex < Job.Objectives.Num() - 1)
	{
		const FString Message = ObjectiveIndex == 0 ? Job.PickupLine : TEXT("这一站完成，继续前往下一站。");
		ObjectiveIndex++;
		HoldSeconds = 0.f;
		HoldRequired = Job.Objectives[ObjectiveIndex].HoldSeconds;
		OutMessage = Message;
		return true;
	}
	const int32 Amount = FMath::RoundToInt(Job.BasePay * (0.65f + 0.65f * (Quality / 100.f)));
	const int32 NextCount = (Completed.FindRef(Job.Id) + 1);
	const FString CreditId = FString::Printf(TEXT("career:%s:%d"), *Job.Id, NextCount);
	if (!Credit(CreditId, Amount))
	{
		OutMessage = TEXT("钱包不可用，未重复发放");
		return false;
	}
	Completed.Add(Job.Id, NextCount);
	OutMessage = FString::Printf(TEXT("%s  收入 +¥ %d · 品质 %.0f"), *Job.ArrivalLine, Amount, Quality);
	ActiveIndex = -1;
	return true;
}
