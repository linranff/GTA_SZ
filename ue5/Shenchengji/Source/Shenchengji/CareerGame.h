#pragma once

#include "CoreMinimal.h"
#include "CityTypes.h"

struct FShenchengjiCareerFrame
{
	double X = 0;
	double Z = 0;
	double Speed = 0;
	double Odometer = 0;
	bool bInVehicle = true;
	bool bPaused = false;
	int32 DebugEpoch = 0;
};

struct FShenchengjiCareerObjective
{
	FString PlaceId;
	FString Label;
	FString Kind;
	float HoldSeconds = 0.f;
};

struct FShenchengjiCareerJob
{
	FString Id;
	FString Role;
	FString Title;
	FString Person;
	FString Mechanic;
	int32 BasePay = 0;
	int32 RequiredLevel = 1;
	TArray<FShenchengjiCareerObjective> Objectives;
	FString PickupLine;
	FString ArrivalLine;
};

class SHENCHENGJI_API FShenchengjiCareerGame
{
public:
	static constexpr double ArriveRadius = 28.0;
	static constexpr double StopSpeed = 1.0;

	void BindPlaces(const TMap<FString, FShenchengjiGamePoint>& InPlaces);
	const TArray<FShenchengjiCareerJob>& GetJobs() const { return Jobs; }
	bool Accept(const FString& JobId, FString& OutMessage);
	bool Cancel(FString& OutMessage);
	void Tick(const FShenchengjiCareerFrame& Frame, float DeltaSeconds);
	bool Interact(const FShenchengjiCareerFrame& Frame, TFunctionRef<bool(const FString&, int32)> Credit, FString& OutMessage);

	bool HasActive() const { return ActiveIndex >= 0; }
	FString ActiveTitle() const;
	FString ActiveObjective() const;
	FString ActivePlaceId() const;
	float HoldProgress() const { return HoldRequired > 0.f ? FMath::Clamp(HoldSeconds / HoldRequired, 0.f, 1.f) : 1.f; }

private:
	void BuildJobs();
	const FShenchengjiGamePoint* PlaceOf(const FString& Id) const;

	TMap<FString, FShenchengjiGamePoint> Places;
	TArray<FShenchengjiCareerJob> Jobs;
	TMap<FString, int32> Completed;
	int32 ActiveIndex = -1;
	int32 ObjectiveIndex = 0;
	float Quality = 100.f;
	float HoldSeconds = 0.f;
	float HoldRequired = 0.f;
	float Elapsed = 0.f;
	int32 DebugEpoch = 0;
	bool bInvalid = false;
};
