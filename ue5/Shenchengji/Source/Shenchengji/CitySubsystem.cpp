#include "CitySubsystem.h"
#include "CareerGame.h"
#include "CityLoader.h"
#include "CitySkeletonActor.h"
#include "CoordinateBridge.h"
#include "CombatLabCore.h"
#include "ImportedCityActor.h"
#include "LifeHubActor.h"
#include "LifeHud.h"
#include "VehicleVisual.h"
#include "WalkerPawn.h"
#include "WalletSubsystem.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/GameInstance.h"
#include "Engine/SkyLight.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"
#include "WheeledVehiclePawn.h"

void UShenchengjiCitySubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	if (InWorld.IsNetMode(NM_DedicatedServer))
	{
		return;
	}
	if (Cast<AShenchengjiCombatLabGameMode>(InWorld.GetAuthGameMode()) || InWorld.GetMapName().Contains(TEXT("CombatLab")))
	{
		UE_LOG(LogTemp, Display, TEXT("战斗试验场：不加载都市生活。"));
		return;
	}
	EnsureLighting(InWorld);
	SpawnCity(InWorld);
	FTimerHandle Handle;
	InWorld.GetTimerManager().SetTimer(Handle, this, &UShenchengjiCitySubsystem::TeleportPlayer, 0.4f, false);
}

// 2026-09-16 standalone run: ShenzhenCity.umap's authored sun/sky did not light the
// world (everything black except emissive windows; `summon DirectionalLight` fixed it).
// The city is code-spawned, so its light rig is too: only add what the map lacks.
void UShenchengjiCitySubsystem::EnsureLighting(UWorld& World)
{
	bool bHasSun = false, bHasSky = false, bHasAtmosphere = false, bHasFog = false;
	for (TActorIterator<AActor> It(&World); It; ++It)
	{
		AActor* Actor = *It;
		if (UDirectionalLightComponent* Sun = Actor->FindComponentByClass<UDirectionalLightComponent>())
		{
			// The map's sun was authored with unreal.Rotator(pitch, yaw, 0), so it points at the
			// sky (forward Z = +0.64): below-horizon sun, black atmosphere. Re-aiming it in place
			// did not take (run 5 still logged Z=0.64), so retire any authored sun that does not
			// shine downwards and let the code-owned sun below replace it.
			if (Sun->GetForwardVector().Z > -0.2)
			{
				Sun->SetVisibility(false);
				Sun->SetAtmosphereSunLight(false);
				UE_LOG(LogTemp, Warning, TEXT("深城纪灯光：地图太阳 %s 朝上（Z=%.2f），已停用并由代码太阳替代。"), *Actor->GetName(), Sun->GetForwardVector().Z);
			}
			else
			{
				bHasSun = true;
			}
		}
		if (USkyLightComponent* Sky = Actor->FindComponentByClass<USkyLightComponent>())
		{
			Sky->SetMobility(EComponentMobility::Movable);
			// One capture at begin-play; a per-frame six-face capture of 2174 components is too slow.
			Sky->SetRealTimeCapture(false);
			Sky->RecaptureSky();
			bHasSky = true;
		}
		bHasAtmosphere = bHasAtmosphere || Actor->FindComponentByClass<USkyAtmosphereComponent>() != nullptr;
		bHasFog = bHasFog || Actor->FindComponentByClass<UExponentialHeightFogComponent>() != nullptr;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (!bHasSun)
	{
		// Late afternoon from the south-west, matching the Babylon baseline's sunset key.
		const FTransform SunTransform(FRotator(-32.0, 45.0, 0.0), FVector(0, 0, 80000.0));
		if (ADirectionalLight* Sun = World.SpawnActorDeferred<ADirectionalLight>(ADirectionalLight::StaticClass(), SunTransform, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn))
		{
			if (UDirectionalLightComponent* Component = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
			{
				// Set before registration so the mobility change is not fighting a live proxy.
				Component->SetMobility(EComponentMobility::Movable);
				Component->SetIntensity(8.0f);
				Component->SetLightColor(FLinearColor(1.0f, 0.86f, 0.70f));
				Component->SetAtmosphereSunLight(true);
				Component->SetDynamicShadowCascades(2);
				Component->SetDynamicShadowDistanceMovableLight(30000.f);
				Component->SetCastShadows(true);
			}
			Sun->FinishSpawning(SunTransform);
			// ADirectionalLight's component carries its own -46 deg pitch; set the final world
			// direction explicitly so the sun sits 32 deg above the south-west horizon.
			if (ULightComponent* Component = Sun->GetLightComponent())
			{
				Component->SetWorldRotation(FRotator(-32.0, 45.0, 0.0));
			}
		}
	}
	if (!bHasAtmosphere)
	{
		if (AActor* Atmosphere = World.SpawnActor<AActor>(AActor::StaticClass(), FTransform::Identity, Params))
		{
			USkyAtmosphereComponent* Component = NewObject<USkyAtmosphereComponent>(Atmosphere, TEXT("SkyAtmosphere"));
			Atmosphere->SetRootComponent(Component);
			Component->RegisterComponent();
		}
	}
	if (!bHasSky)
	{
		if (ASkyLight* Sky = World.SpawnActor<ASkyLight>(FVector(0, 0, 20000.0), FRotator::ZeroRotator, Params))
		{
			if (USkyLightComponent* Component = Sky->GetLightComponent())
			{
				Component->SetMobility(EComponentMobility::Movable);
				Component->SetRealTimeCapture(false);
				Component->SetIntensity(1.0f);
				Component->RecaptureSky();
			}
		}
	}
	if (!bHasFog)
	{
		if (AExponentialHeightFog* Fog = World.SpawnActor<AExponentialHeightFog>(FVector::ZeroVector, FRotator::ZeroRotator, Params))
		{
			if (UExponentialHeightFogComponent* Component = Fog->GetComponent())
			{
				// The city spans ~10 km; keep distant blocks readable.
				Component->SetFogDensity(0.004f);
				Component->SetFogHeightFalloff(0.15f);
				Component->SetStartDistance(3000.f);
			}
		}
	}
	FVector SunDir = FVector::ZeroVector;
	for (TActorIterator<ADirectionalLight> It(&World); It; ++It)
	{
		if (It->GetLightComponent() && It->GetLightComponent()->IsVisible())
		{
			SunDir = It->GetLightComponent()->GetForwardVector();
		}
	}
	UE_LOG(LogTemp, Display, TEXT("深城纪灯光：地图自带 sun=%d sky=%d atmosphere=%d fog=%d；太阳方向 (%.2f, %.2f, %.2f)；缺项已由代码补齐。"), bHasSun, bHasSky, bHasAtmosphere, bHasFog, SunDir.X, SunDir.Y, SunDir.Z);
}

void UShenchengjiCitySubsystem::SpawnCity(UWorld& World)
{
	FString Error;
	if (!FShenchengjiCityLoader::LoadSkeleton(Skeleton, Error))
	{
		UE_LOG(LogTemp, Error, TEXT("深城纪城市骨架未载入：%s"), *Error);
		return;
	}
	if (!Story.LoadFromDisk(Error))
	{
		UE_LOG(LogTemp, Error, TEXT("深城纪故事未载入：%s"), *Error);
	}
	Career.BindPlaces(Skeleton.Places);

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	CityActor = World.SpawnActor<AShenchengjiCitySkeletonActor>(AShenchengjiCitySkeletonActor::StaticClass(), FTransform::Identity, Params);
	if (CityActor)
	{
		CityActor->BuildFromSkeleton(Skeleton);
	}
	if (AShenchengjiImportedCityActor* Imported = World.SpawnActor<AShenchengjiImportedCityActor>(AShenchengjiImportedCityActor::StaticClass(), FTransform::Identity, Params))
	{
		if (Imported->BuildFromLayout() > 40)
		{
			CityActor->HideProxyCity();
		}
	}

	TSet<FString> HubIds = {TEXT("hub"), TEXT("office"), TEXT("workshop")};
	for (const FString& Id : HubIds)
	{
		if (const FShenchengjiGamePoint* Site = Skeleton.Places.Find(Id))
		{
			if (AShenchengjiLifeHubActor* Hub = World.SpawnActor<AShenchengjiLifeHubActor>(AShenchengjiLifeHubActor::StaticClass(), FTransform::Identity, Params))
			{
				Hub->Place(*Site);
			}
		}
	}
}

void UShenchengjiCitySubsystem::TeleportPlayer()
{
	UWorld* World = GetWorld();
	if (!World || !CityActor)
	{
		return;
	}
	if (APlayerController* Controller = World->GetFirstPlayerController())
	{
		Vehicle = Controller->GetPawn();
		CityActor->TeleportPawnToPlace(Vehicle, TEXT("hub"));
		FShenchengjiVehicleVisual::AttachImportedCar(Vehicle);
		Controller->ClientSetHUD(AShenchengjiLifeHud::StaticClass());
		Hud = Cast<AShenchengjiLifeHud>(Controller->GetHUD());
		BindInput();
		RefreshHud();
	}
}

void UShenchengjiCitySubsystem::BindInput()
{
	APlayerController* Controller = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	if (!Controller || !Controller->InputComponent || bInputBound)
	{
		return;
	}
	Controller->InputComponent->BindKey(EKeys::F, IE_Pressed, this, &UShenchengjiCitySubsystem::ToggleWalk);
	Controller->InputComponent->BindKey(EKeys::E, IE_Pressed, this, &UShenchengjiCitySubsystem::HandleInteract);
	Controller->InputComponent->BindKey(EKeys::J, IE_Pressed, this, &UShenchengjiCitySubsystem::HandleStartStory);
	Controller->InputComponent->BindKey(EKeys::One, IE_Pressed, this, &UShenchengjiCitySubsystem::ChooseOne);
	Controller->InputComponent->BindKey(EKeys::Two, IE_Pressed, this, &UShenchengjiCitySubsystem::ChooseTwo);
	Controller->InputComponent->BindKey(EKeys::Three, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob3);
	Controller->InputComponent->BindKey(EKeys::Four, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob4);
	Controller->InputComponent->BindKey(EKeys::Five, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob5);
	Controller->InputComponent->BindKey(EKeys::Six, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob6);
	Controller->InputComponent->BindKey(EKeys::Seven, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob7);
	Controller->InputComponent->BindKey(EKeys::Eight, IE_Pressed, this, &UShenchengjiCitySubsystem::AcceptJob8);
	bInputBound = true;
}

void UShenchengjiCitySubsystem::ReadPawn(double& OutX, double& OutZ, double& OutSpeed, bool& bWalkingNow) const
{
	bWalkingNow = bWalking;
	OutX = OutZ = OutSpeed = 0;
	if (const APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0))
	{
		double Height = 0;
		FShenchengjiCoordinateBridge::UnrealToGame(Pawn->GetActorLocation(), OutX, OutZ, Height);
		OutSpeed = Pawn->GetVelocity().Size() / 100.0;
	}
}

FShenchengjiStoryFrame UShenchengjiCitySubsystem::MakeStoryFrame() const
{
	FShenchengjiStoryFrame Frame;
	ReadPawn(Frame.X, Frame.Z, Frame.Speed, Frame.bInVehicle);
	Frame.bInVehicle = !bWalking;
	return Frame;
}

FShenchengjiCareerFrame UShenchengjiCitySubsystem::MakeCareerFrame() const
{
	FShenchengjiCareerFrame Frame;
	bool Dummy = false;
	ReadPawn(Frame.X, Frame.Z, Frame.Speed, Dummy);
	Frame.bInVehicle = !bWalking;
	Frame.Odometer = Odometer;
	return Frame;
}

void UShenchengjiCitySubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	if (!GetWorld() || GetWorld()->IsNetMode(NM_DedicatedServer))
	{
		return;
	}
	if (!bInputBound)
	{
		BindInput();
	}
	const FShenchengjiCareerFrame Frame = MakeCareerFrame();
	Odometer += Frame.Speed * DeltaTime;
	Career.Tick(Frame, DeltaTime);
	RefreshHud();
}

void UShenchengjiCitySubsystem::ToggleWalk()
{
	APlayerController* Controller = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	if (!Controller)
	{
		return;
	}
	APawn* Current = Controller->GetPawn();
	if (!Current)
	{
		return;
	}
	double X, Z, Speed;
	bool Dummy;
	ReadPawn(X, Z, Speed, Dummy);
	if (Speed >= 1.0)
	{
		UE_LOG(LogTemp, Display, TEXT("先停稳再下车。"));
		return;
	}

	if (!bWalking)
	{
		Vehicle = Current;
		const FVector Location = Current->GetActorLocation() + Current->GetActorRightVector() * 190.f;
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		Walker = GetWorld()->SpawnActor<AShenchengjiWalker>(AShenchengjiWalker::StaticClass(), Location, Current->GetActorRotation(), Params);
		if (!Walker)
		{
			return;
		}
		if (AWheeledVehiclePawn* Wheeled = Cast<AWheeledVehiclePawn>(Vehicle))
		{
			if (UChaosWheeledVehicleMovementComponent* Movement = Cast<UChaosWheeledVehicleMovementComponent>(Wheeled->GetVehicleMovementComponent()))
			{
				Movement->SetHandbrakeInput(true);
			}
		}
		Controller->Possess(Walker);
		bWalking = true;
	}
	else if (Vehicle)
	{
		const double Distance = FVector::Dist(Current->GetActorLocation(), Vehicle->GetActorLocation()) / 100.0;
		if (Distance > 5.0)
		{
			UE_LOG(LogTemp, Display, TEXT("靠近车辆再上车。"));
			return;
		}
		Controller->Possess(Vehicle);
		if (Walker)
		{
			Walker->Destroy();
			Walker = nullptr;
		}
		bWalking = false;
	}
	RefreshHud();
}

bool UShenchengjiCitySubsystem::StartLastDelivery()
{
	FString Message;
	const bool bOk = Story.Start(Message);
	UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
	RefreshHud();
	return bOk;
}

bool UShenchengjiCitySubsystem::Interact()
{
	FString Message;
	if (Career.HasActive())
	{
		UShenchengjiWalletSubsystem* Wallet = GetWorld() && GetWorld()->GetGameInstance()
			? GetWorld()->GetGameInstance()->GetSubsystem<UShenchengjiWalletSubsystem>()
			: nullptr;
		if (!Wallet)
		{
			return false;
		}
		const bool bOk = Career.Interact(MakeCareerFrame(), [&](const FString& Id, int32 Amount) { return Wallet->Credit(Id, Amount); }, Message);
		UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
		RefreshHud();
		return bOk;
	}

	const FShenchengjiStoryFrame Frame = MakeStoryFrame();
	if (Story.GetPhase() == EShenchengjiStoryPhase::Travel)
	{
		if (Frame.bInVehicle)
		{
			UE_LOG(LogTemp, Display, TEXT("停稳后按 F 下车，再按 E 交接。"));
			return false;
		}
		const FShenchengjiGamePoint* Destination = Story.GetDestination(Skeleton);
		if (!Destination)
		{
			return false;
		}
		const double Distance = FMath::Sqrt(FMath::Square(Frame.X - Destination->X) + FMath::Square(Frame.Z - Destination->Z));
		if (Distance > FShenchengjiStoryGame::ArriveRadius || Frame.Speed >= FShenchengjiStoryGame::StopSpeed)
		{
			UE_LOG(LogTemp, Display, TEXT("%s"), *FString::Printf(TEXT("到 %s 停稳下车再交接（还差 %.1f 米）"), *Destination->Name, Distance));
			return false;
		}
		const bool bArrived = Story.Arrive(Message);
		UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
		RefreshHud();
		return bArrived;
	}
	if (Story.GetPhase() == EShenchengjiStoryPhase::Payout)
	{
		UShenchengjiWalletSubsystem* Wallet = GetWorld() && GetWorld()->GetGameInstance()
			? GetWorld()->GetGameInstance()->GetSubsystem<UShenchengjiWalletSubsystem>()
			: nullptr;
		if (!Wallet)
		{
			return false;
		}
		const bool bPaid = Story.TryPayout([&](const FString& Id, int32 Amount) { return Wallet->Credit(Id, Amount); }, Message);
		UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
		RefreshHud();
		return bPaid;
	}
	const bool bOk = Story.Interact(Frame, Message);
	UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
	RefreshHud();
	return bOk;
}

bool UShenchengjiCitySubsystem::ChooseStory(const FString& ChoiceId)
{
	FString Message;
	const bool bOk = Story.Choose(ChoiceId, Message);
	UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
	RefreshHud();
	return bOk;
}

void UShenchengjiCitySubsystem::AcceptJobByIndex(int32 Index)
{
	const TArray<FShenchengjiCareerJob>& Jobs = Career.GetJobs();
	if (!Jobs.IsValidIndex(Index))
	{
		return;
	}
	FString Message;
	Career.Accept(Jobs[Index].Id, Message);
	UE_LOG(LogTemp, Display, TEXT("%s"), *Message);
	RefreshHud();
}

void UShenchengjiCitySubsystem::RefreshHud()
{
	APlayerController* Controller = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	if (Controller && !Hud)
	{
		Hud = Cast<AShenchengjiLifeHud>(Controller->GetHUD());
	}
	if (!Hud)
	{
		return;
	}
	Hud->bWalking = bWalking;
	if (UShenchengjiWalletSubsystem* Wallet = GetWorld() && GetWorld()->GetGameInstance()
		? GetWorld()->GetGameInstance()->GetSubsystem<UShenchengjiWalletSubsystem>()
		: nullptr)
	{
		Hud->Cash = Wallet->GetCash();
	}

	if (const FShenchengjiStoryStep* Step = Story.GetStep())
	{
		Hud->Objective = Step->Objective;
		Hud->Dialogue = Story.CurrentLine();
		Hud->ChoiceA = Step->Choices.Num() > 0 ? Step->Choices[0].Label : FString();
		Hud->ChoiceB = Step->Choices.Num() > 1 ? Step->Choices[1].Label : FString();
		Hud->Prompt = Story.GetPhase() == EShenchengjiStoryPhase::Travel ? TEXT("开车到目标，停稳下车后按 E") : TEXT("E 继续 / 1 2 选择");
	}
	else if (Career.HasActive())
	{
		Hud->Objective = Career.ActiveObjective();
		Hud->Dialogue.Reset();
		Hud->ChoiceA.Reset();
		Hud->ChoiceB.Reset();
		Hud->Prompt = Career.HoldProgress() < 1.f
			? FString::Printf(TEXT("停车巡检 %.0f%%"), Career.HoldProgress() * 100.f)
			: TEXT("到站停稳后按 E");
	}
	else
	{
		Hud->Objective = TEXT("J 最后一单  3热饭 4两站 5十分钟 6准点离开 7雨后巡检 8亮灯");
		Hud->Dialogue.Reset();
		Hud->ChoiceA.Reset();
		Hud->ChoiceB.Reset();
		Hud->Prompt = TEXT("海湾生活驿站已就绪");
	}
}
